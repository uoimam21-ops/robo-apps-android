#!/usr/bin/env bash
# Builds the Robo Apps shell: build/robo-apps-shell.apk (not signed: the page signs each kid's app). No Gradle: the SDK's own tools.
set -euo pipefail
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"; BT="$SDK/build-tools/${BUILD_TOOLS:-34.0.0}"; JAR="$SDK/platforms/android-34/android.jar"
rm -rf build && mkdir -p build/classes build/dex
"$BT/aapt2" compile --dir app/res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$JAR" --manifest app/AndroidManifest.xml -A app/assets build/res.zip --min-sdk-version 24 --target-sdk-version 34 -0 arsc
javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 -classpath "$JAR" -d build/classes $(find app/src -name '*.java')
"$BT/d8" --min-api 24 --lib "$JAR" --output build/dex $(find build/classes -name '*.class')
cp build/base.apk build/unaligned.apk && (cd build/dex && zip -q ../unaligned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unaligned.apk build/robo-apps-shell.apk
ls -l build/robo-apps-shell.apk
