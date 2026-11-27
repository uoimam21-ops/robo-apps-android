package com.roboegypt.apps;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Robo Apps on Android: the kid's app (assets/index.html, written by roboegypt.com/lab/apps) in a full-screen WebView, plus what a web
 * page can't do on a phone: classic Bluetooth (HC-05 / HC-06, the module in Robo Maker's car), speech and vibration.
 * The page calls window.RoboAndroid.*; Bluetooth answers come back through window.__btState(on) and window.__btRecv(text).
 */
public class MainActivity extends Activity {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int REQ_BT = 7;
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;
    private BluetoothSocket sock;
    private OutputStream btOut;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "RoboAndroid");
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);
        tts = new TextToSpeech(this, st -> ttsReady = st == TextToSpeech.SUCCESS);
        web.loadUrl("file:///android_asset/index.html");
    }

    private void js(final String code) {
        runOnUiThread(() -> web.evaluateJavascript(code, null));
    }

    private void btState(boolean on) {
        js("window.__btState&&__btState(" + on + ")");
    }

    private void toast(final String t) {
        runOnUiThread(() -> Toast.makeText(this, t, Toast.LENGTH_LONG).show());
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    /** Android 12+: ask for «nearby devices» first */
    private boolean btAllowed() {
        if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BT);
            return false;
        }
        return true;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] p, int[] r) {
        super.onRequestPermissionsResult(code, p, r);
        if (code == REQ_BT) {
            if (r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) pickDevice();
            else { toast("اسمح للتطبيق باستخدام البلوتوث"); btState(false); }
        }
    }

    @SuppressWarnings("MissingPermission")
    private void pickDevice() {
        BluetoothAdapter a = adapter();
        if (a == null) { toast("هذا الموبايل ليس فيه بلوتوث"); btState(false); return; }
        if (!a.isEnabled()) { toast("شغّل البلوتوث من إعدادات الموبايل، ثم جرّب مرّة أخرى"); btState(false); return; }
        Set<BluetoothDevice> paired = a.getBondedDevices();
        if (paired == null || paired.isEmpty()) { toast("اقرن الموديول (HC-05) من إعدادات البلوتوث أولًا. الرقم السري غالبًا 1234"); btState(false); return; }
        final List<BluetoothDevice> list = new ArrayList<>(paired);
        String[] names = new String[list.size()];
        for (int i = 0; i < names.length; i++) {
            String n = list.get(i).getName();
            names[i] = (n == null ? "?" : n) + "  (" + list.get(i).getAddress() + ")";
        }
        runOnUiThread(() -> new AlertDialog.Builder(this)
                .setTitle("اختر جهاز البلوتوث")
                .setItems(names, (d, i) -> connect(list.get(i)))
                .setOnCancelListener(d -> btState(false))
                .show());
    }

    @SuppressWarnings("MissingPermission")
    private void connect(final BluetoothDevice dev) {
        new Thread(() -> {
            closeBt();
            try {
                BluetoothAdapter a = adapter();
                if (a != null) a.cancelDiscovery();
                BluetoothSocket sk = dev.createRfcommSocketToServiceRecord(SPP);
                sk.connect();
                sock = sk;
                btOut = sk.getOutputStream();
                btState(true);
                toast("متصل ✅");
                readLoop(sk.getInputStream());
            } catch (Exception e) {
                toast("لم يتم الاتصال: " + e.getMessage());
                closeBt();
                btState(false);
            }
        }).start();
    }

    private void readLoop(InputStream in) {
        byte[] buf = new byte[256];
        StringBuilder line = new StringBuilder();
        try {
            while (true) {
                int n = in.read(buf);
                if (n < 0) break;
                String part = new String(buf, 0, n, StandardCharsets.UTF_8);
                for (char c : part.toCharArray()) {
                    if (c == '\n' || c == '\r') {
                        if (line.length() > 0) { send(line.toString()); line.setLength(0); }
                    } else line.append(c);
                }
                if (line.length() > 60) { send(line.toString()); line.setLength(0); }
            }
        } catch (Exception ignored) {
        }
        closeBt();
        btState(false);
    }

    private void send(String text) {
        js("window.__btRecv&&__btRecv(" + JSONObject.quote(text) + ")");
    }

    private void closeBt() {
        try { if (sock != null) sock.close(); } catch (Exception ignored) { }
        sock = null;
        btOut = null;
    }

    class Bridge {
        @JavascriptInterface
        public void say(String text) {
            if (!ttsReady || text == null) return;
            boolean ar = text.matches(".*[\\u0600-\\u06FF].*");
            tts.setLanguage(ar ? new Locale("ar") : Locale.ENGLISH);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "robo");
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(Math.max(20, ms), VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(Math.max(20, ms));
        }

        @JavascriptInterface
        public void btConnect() {
            runOnUiThread(() -> { if (btAllowed()) pickDevice(); });
        }

        @JavascriptInterface
        public void btSend(String text) {
            final OutputStream o = btOut;
            if (o == null || text == null) return;
            new Thread(() -> {
                try { o.write(text.getBytes(StandardCharsets.UTF_8)); o.flush(); } catch (Exception e) { closeBt(); btState(false); }
            }).start();
        }

        @JavascriptInterface
        public boolean isAndroid() { return true; }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        closeBt();
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }
}
