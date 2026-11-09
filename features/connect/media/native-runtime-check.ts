import { NativeModules, Platform } from 'react-native';
import { assertConnectNativeRuntime } from './native-runtime-contract';

export function checkConnectNativeRuntime() { assertConnectNativeRuntime(NativeModules, Platform.OS); }
