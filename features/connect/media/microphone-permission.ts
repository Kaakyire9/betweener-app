// Compatibility exports; both capture permissions share the fail-closed resolver.
export { resolveCapturePermission as resolveMicrophonePermission } from './capture-permission.ts';
export type { CapturePermissionPort as MicrophonePermissionPort } from './capture-permission.ts';
