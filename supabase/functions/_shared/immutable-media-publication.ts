export type ImmutableMediaStore = {
  read(bucket: string, path: string): Promise<Uint8Array>;
  write(bucket: string, path: string, bytes: Uint8Array, mime: string): Promise<void>;
  remove(bucket: string, paths: string[]): Promise<void>;
};

export const bytesEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
};

export async function publishCapturedBytes(args: {
  store: ImmutableMediaStore;
  capturedBytes: Uint8Array;
  finalBucket: string;
  finalPath: string;
  mime: string;
  allowExistingExact?: boolean;
}): Promise<void> {
  const immutableCopy = args.capturedBytes.slice();
  try {
    await args.store.write(args.finalBucket, args.finalPath, immutableCopy, args.mime);
  } catch (error) {
    if (!args.allowExistingExact) throw error;
    const existing = await args.store.read(args.finalBucket, args.finalPath);
    if (!bytesEqual(immutableCopy, existing)) throw error;
    return;
  }
  const published = await args.store.read(args.finalBucket, args.finalPath);
  if (!bytesEqual(immutableCopy, published)) {
    await args.store.remove(args.finalBucket, [args.finalPath]).catch(() => undefined);
    throw new Error('immutable_publication_verification_failed');
  }
}

export async function requireSafeExactHash(args: {
  sha256: string;
  match: (sha256: string) => Promise<{ authorized: boolean; matched: boolean }>;
}): Promise<void> {
  const result = await args.match(args.sha256);
  if (!result.authorized) throw new Error('unsafe_hash_matcher_unavailable');
  if (result.matched) throw new Error('unsafe_hash_matched');
}

export const requireSafeViewOncePlaintextHash = requireSafeExactHash;
