// CI check: put a test app in the shell like the page does, sign it, and let apksigner (Android's own checker) verify it.
import { readFileSync, writeFileSync } from 'node:fs';
import { makeApk, newKey } from './apk-make.mjs';
const shell = readFileSync(process.argv[2]);
const key = await newKey();
const html = '<!doctype html><meta charset="utf-8"><body><h1>اختبار روبو</h1><script>window.RoboAndroid&&RoboAndroid.vibrate(100)</script>';
const apk = await makeApk(shell, { name: 'تطبيق الاختبار', id12: 'testabcdefgh', html, key });
writeFileSync(process.argv[3], apk);
console.log('made', process.argv[3], apk.length, 'bytes');
