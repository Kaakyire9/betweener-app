/* global __dirname */
const path = require('node:path');
const { prepare } = require('./lib/native-webrtc-artifacts.cjs');

prepare({ projectRoot: path.resolve(__dirname, '..'), platform: process.env.EAS_BUILD_PLATFORM })
  .then(result => console.log(JSON.stringify({ strictNativeWebRtc: result })))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
