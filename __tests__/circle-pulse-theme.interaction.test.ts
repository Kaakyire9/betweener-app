// @ts-nocheck
import { Colors } from '@/constants/theme';
import { getCirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

describe('Circle Pulse theme palette', () => {
  it('uses the app light theme for Circle surfaces', () => {
    const palette = getCirclePulsePalette('light');

    expect(palette.text).toBe(Colors.light.text);
    expect(palette.surface).toBe(Colors.light.backgroundSubtle);
    expect(palette.tealStrong).toBe(Colors.light.tint);
  });

  it('keeps light and dark treatments distinct', () => {
    const light = getCirclePulsePalette('light');
    const dark = getCirclePulsePalette('dark');

    expect(light.gradient).not.toEqual(dark.gradient);
    expect(light.viewerGradient).not.toEqual(dark.viewerGradient);
    expect(light.surfaceStrong).not.toBe(dark.surfaceStrong);
  });
});
