# Robo Apps for Android

The Android shell for **[Robo Apps](https://roboegypt.com/lab/apps)** (روبو تطبيقات), the phone-app lab of Robo Egypt.

Kids design an app with blocks on the site. When they press **⬇ APK**, the page takes this shell and builds their real Android app
right on their device. No server and no build machine are involved:

- the app's page goes in `assets/index.html`
- its own package name (`com.roboegypt.app.` + 12 letters), so apps never replace each other
- its name and its icon
- an APK Signature Scheme v2 signature, with a key kept in the browser

The shell is one full-screen WebView. It also adds what a web page can't do on a phone:

- classic Bluetooth (HC-05 / HC-06, as in Robo Maker's car)
- speech (TextToSpeech)
- vibration

The page reaches these through `window.RoboAndroid`.

- `app/` holds the shell: the manifest, `MainActivity.java`, and the placeholder name, icon and page.
- `build.sh` builds `build/robo-apps-shell.apk` with the SDK's own tools (aapt2, javac, d8, zipalign), without Gradle.
- `tools/apk-make.mjs` is what the page does. It is kept the same as `legacy/src/lab/apk-make.js` on the site.
- `.github/workflows/build.yml` builds the shell, makes a test app from it, and checks it with `apksigner`. It then puts the shell
  on the `dist` branch.
