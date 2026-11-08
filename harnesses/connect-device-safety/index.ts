import { installNetworkDeny } from './network-guard.ts';

/* eslint-disable @typescript-eslint/no-require-imports -- Guard must run before native module evaluation. */

// Run before importing the harness UI/native adapters. This entry never loads app/_layout.
const network = installNetworkDeny(globalThis, __DEV__);
const { registerRootComponent } = require('expo');
const { createElement } = require('react');
const { DeviceSafetyScreen } = require('./DeviceSafetyScreen');
registerRootComponent(() => createElement(DeviceSafetyScreen, { network }));
