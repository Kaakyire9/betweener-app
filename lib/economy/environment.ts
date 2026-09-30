export const getEconomyEnvironment = (): 'staging' | 'production' =>
  String(process.env.EXPO_PUBLIC_ENVIRONMENT || '').trim().toLowerCase() === 'production'
    ? 'production'
    : 'staging';
