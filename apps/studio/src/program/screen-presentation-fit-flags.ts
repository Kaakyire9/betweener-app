const enabled = (value: string | undefined) => value === 'true';

export const screenPresentationFitFlags = Object.freeze({
  v1: enabled(import.meta.env.VITE_SCREEN_FIT_V1_ENABLED),
  fitLab: enabled(import.meta.env.VITE_SCREEN_FIT_LAB_ENABLED),
});
