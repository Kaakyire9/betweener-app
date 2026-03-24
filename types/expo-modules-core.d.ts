// Some Expo modules still reference `EventSubscription` in TS sources.
// Newer expo-modules-core exports `Subscription`. Provide a compatibility alias
// so `tsc` doesn't fail when node_modules ship `.ts` sources.
declare module 'expo-modules-core' {
  export type EventSubscription = Subscription;

  // Back-compat exports referenced by some Expo modules' TS sources.
  export class NativeModule<_TEvents = any> {}
  export function requireOptionalNativeModule<T = any>(name: string): T | null;
  export class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string);
  }
  export const uuid: { v4: () => string };
}
