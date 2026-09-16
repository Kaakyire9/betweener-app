// @ts-nocheck
export type QrDecodeResult = {
  payloads: string[];
  attempted: boolean;
  failureReason: string | null;
  width: number | null;
  height: number | null;
};

const rgbaFromRgb = (data: Uint8Array, width: number, height: number) => {
  if (data.length === width * height * 4) return new Uint8ClampedArray(data);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let source = 0, target = 0; source < data.length; source += 3, target += 4) {
    rgba[target] = data[source];
    rgba[target + 1] = data[source + 1];
    rgba[target + 2] = data[source + 2];
    rgba[target + 3] = 255;
  }
  return rgba;
};

const unwrapDefault = (value: unknown) => {
  let resolved = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!resolved || typeof resolved !== 'object' || !('default' in resolved)) break;
    resolved = (resolved as Record<string, unknown>).default;
  }
  return resolved;
};

const moduleMember = <T>(module: Record<string, unknown>, name: string): T | null => {
  const direct = module[name];
  if (direct != null) return (name === 'default' ? unwrapDefault(direct) : direct) as T;
  const fallback = module.default;
  if (fallback && typeof fallback === 'object' && name in fallback) {
    const nested = (fallback as Record<string, unknown>)[name];
    return (name === 'default' ? unwrapDefault(nested) : nested) as T;
  }
  if (name === 'default' && fallback != null) return unwrapDefault(fallback) as T;
  return null;
};

export async function decodeQrPayloads(bytes: Uint8Array, mime: string): Promise<QrDecodeResult> {
  let jsQR: ((data: Uint8ClampedArray, width: number, height: number,
    options: { inversionAttempts: string }) => { data?: string } | null) | null = null;
  try {
    // Literal package specifiers let the Edge bundler resolve the function's
    // pinned import map while Node resolves the same local development deps.
    const jsQrModule = await import('jsqr');
    jsQR = moduleMember<(data: Uint8ClampedArray, width: number, height: number,
      options: { inversionAttempts: string }) => { data?: string } | null>(
        jsQrModule as Record<string, unknown>,
        'default',
      );
    if (typeof jsQR !== 'function') {
      return {
        payloads: [], attempted: true, failureReason: 'QR_DECODER_UNAVAILABLE',
        width: null, height: null,
      };
    }
  } catch {
    return {
      payloads: [], attempted: true, failureReason: 'QR_DECODER_UNAVAILABLE',
      width: null, height: null,
    };
  }

  try {
    let width = 0;
    let height = 0;
    let rgba: Uint8ClampedArray;
    if (mime === 'image/png') {
      const pngModule = await import('fast-png');
      const decodePng = moduleMember<(input: Uint8Array) => {
        width: number; height: number; data: Uint8Array;
      }>(pngModule as Record<string, unknown>, 'decode');
      if (!decodePng) throw new Error('PNG_DECODER_UNAVAILABLE');
      const decoded = decodePng(bytes);
      width = decoded.width;
      height = decoded.height;
      rgba = rgbaFromRgb(decoded.data, width, height);
    } else if (mime === 'image/jpeg') {
      const jpegModule = await import('jpeg-js');
      const jpeg = moduleMember<{
        decode: (input: Uint8Array, options: Record<string, boolean>) => {
          width: number; height: number; data: Uint8Array;
        };
      }>(jpegModule as Record<string, unknown>, 'default');
      if (!jpeg?.decode) throw new Error('JPEG_DECODER_UNAVAILABLE');
      const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
      width = decoded.width;
      height = decoded.height;
      rgba = new Uint8ClampedArray(decoded.data);
    } else {
      return {
        payloads: [], attempted: false, failureReason: 'QR_FORMAT_UNSUPPORTED',
        width: null, height: null,
      };
    }
    if (width <= 0 || height <= 0 || rgba.length !== width * height * 4) {
      return {
        payloads: [], attempted: true, failureReason: 'QR_IMAGE_DECODE_INVALID',
        width, height,
      };
    }
    let decoded: { data?: string } | null;
    try {
      decoded = jsQR(rgba, width, height, { inversionAttempts: 'attemptBoth' });
    } catch {
      return { payloads: [], attempted: true, failureReason: 'QR_SCAN_FAILED', width, height };
    }
    return {
      payloads: decoded?.data ? [decoded.data.trim()].filter(Boolean) : [],
      attempted: true,
      failureReason: null,
      width,
      height,
    };
  } catch {
    return {
      payloads: [], attempted: true, failureReason: 'QR_IMAGE_DECODE_FAILED',
      width: null, height: null,
    };
  }
}
