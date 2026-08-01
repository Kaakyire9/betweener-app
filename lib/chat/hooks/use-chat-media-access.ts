import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MessageType } from '@/components/chat/types';
import {
  CachedChatMediaResolver,
  type ChatMediaAccessFailure,
  type ChatMediaAccessResult,
  type ChatMediaResolver,
} from '@/lib/chat/media/chat-media-access';
import { getChatVisualMediaPaths } from '@/lib/chat/media/chat-media-paths';

type MediaAccessState = {
  uri?: string;
  failure?: ChatMediaAccessFailure;
  retryAt?: number;
  refreshAt?: number;
};

type UseChatMediaAccessOptions = {
  messages: readonly MessageType[];
  online: boolean;
  signUrl: (storagePath: string) => Promise<string | null>;
  /** Resolves a durable device copy before any network or signing work. */
  findLocalUri?: (storagePath: string) => Promise<string | null>;
  /** Reads an already-primed local manifest without delaying first render. */
  peekLocalUri?: (storagePath: string) => string | null;
};

const resultToState = (
  result: ChatMediaAccessResult,
  refreshAt?: number | null,
): MediaAccessState =>
  result.status === 'ready'
    ? { uri: result.uri, refreshAt: refreshAt ?? undefined }
    : {
        failure: result.failure,
        retryAt: result.retryAt,
      };

/**
 * Owns private chat-media URL state outside canonical messages.
 *
 * Message rows are presentation-only consumers. URL signing is deduplicated,
 * rate-limited, expiry-aware, and never writes short-lived URLs into the
 * persisted/reconciled thread model.
 */
export const useChatMediaAccess = ({
  messages,
  online,
  signUrl,
  findLocalUri,
  peekLocalUri,
}: UseChatMediaAccessOptions) => {
  const resolverRef = useRef<ChatMediaResolver>(new CachedChatMediaResolver());
  const [stateByPath, setStateByPath] = useState<Record<string, MediaAccessState>>({});
  const [locallyHydratedPathKey, setLocallyHydratedPathKey] = useState('');
  const paths = useMemo(() => getChatVisualMediaPaths(messages), [messages]);
  const pathKey = paths.join('\u001f');
  const pathsRef = useRef(paths);
  pathsRef.current = paths;

  const applyResult = useCallback((path: string, result: ChatMediaAccessResult) => {
    const nextState = resultToState(
      result,
      resolverRef.current.getRefreshAt(path),
    );
    setStateByPath((current) => {
      const previous = current[path];
      if (
        previous?.uri === nextState.uri &&
        previous?.failure === nextState.failure &&
        previous?.retryAt === nextState.retryAt &&
        previous?.refreshAt === nextState.refreshAt
      ) {
        return current;
      }
      return { ...current, [path]: nextState };
    });
  }, []);

  const resolvePath = useCallback(
    async (
      path: string,
      options?: { force?: boolean; bypassBackoff?: boolean },
    ) => {
      if (!path.trim()) return null;
      if (!options?.force && findLocalUri) {
        const localUri = await findLocalUri(path).catch(() => null);
        if (localUri) {
          const result = { status: 'ready', uri: localUri, source: 'cache' } as const;
          applyResult(path, result);
          return result;
        }
      }
      if (!online) return null;
      const result = await resolverRef.current.resolve(path, signUrl, options);
      applyResult(path, result);
      return result;
    },
    [applyResult, findLocalUri, online, signUrl],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (paths.length === 0) {
        setLocallyHydratedPathKey(pathKey);
        return;
      }

      // Resolve durable device copies before signing. This prevents cached
      // media rows from briefly mounting without their thumbnail or poster.
      const localEntries = await Promise.all(
        paths.map(async (path) => {
          const localUri = findLocalUri
            ? await findLocalUri(path).catch(() => null)
            : null;
          const knownUri = localUri ? null : resolverRef.current.getKnownUri(path);
          const uri = localUri ?? knownUri;
          return uri
            ? {
                path,
                result: { status: 'ready', uri, source: 'cache' } as const,
              }
            : null;
        }),
      );
      if (cancelled) return;
      localEntries.forEach((entry) => {
        if (entry) applyResult(entry.path, entry.result);
      });
      setLocallyHydratedPathKey(pathKey);

      if (!online) return;
      const locallyReadyPaths = new Set(
        localEntries
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          .map((entry) => entry.path),
      );
      const remoteEntries = await Promise.all(
        paths
          .filter((path) => !locallyReadyPaths.has(path))
          .map(async (path) => ({
            path,
            result: await resolverRef.current.resolve(path, signUrl),
          })),
      );
      if (cancelled) return;
      remoteEntries.forEach((entry) => applyResult(entry.path, entry.result));
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [applyResult, findLocalUri, online, pathKey, signUrl]);

  useEffect(() => {
    if (!online) return;
    const nextWakeAt = Object.entries(stateByPath)
      .filter(
        ([path]) => pathsRef.current.includes(path),
      )
      .reduce<number | null>(
        (earliest, [, state]) => {
          const wakeAt =
            state.failure && state.failure !== 'retry_exhausted'
              ? state.retryAt
              : state.uri
              ? state.refreshAt
              : undefined;
          if (typeof wakeAt !== 'number') return earliest;
          return (
          earliest === null
            ? wakeAt
            : Math.min(earliest, wakeAt)
          );
        },
        null,
      );
    if (nextWakeAt === null) return;
    const timer = setTimeout(() => {
      pathsRef.current.forEach((path) => {
        const mediaState = stateByPath[path];
        if (mediaState?.failure && mediaState.failure !== 'retry_exhausted') {
          void resolvePath(path);
        } else if (
          mediaState?.uri &&
          typeof mediaState.refreshAt === 'number' &&
          mediaState.refreshAt <= Date.now()
        ) {
          void resolvePath(path, { force: true });
        }
      });
    }, Math.max(0, nextWakeAt - Date.now()));
    return () => clearTimeout(timer);
  }, [online, resolvePath, stateByPath]);

  useEffect(() => {
    const activePaths = new Set(pathKey ? pathKey.split('\u001f') : []);
    setStateByPath((current) => {
      const entries = Object.entries(current).filter(([path]) => activePaths.has(path));
      return entries.length === Object.keys(current).length
        ? current
        : Object.fromEntries(entries);
    });
  }, [pathKey]);

  const reportLoadError = useCallback(
    (path: string | null | undefined, cause?: unknown) => {
      if (!path?.trim()) return;
      const result = resolverRef.current.invalidate(path, cause);
      applyResult(path, result);
    },
    [applyResult],
  );

  const retry = useCallback(
    async (path: string | null | undefined) => {
      if (!path?.trim() || !online) return null;
      resolverRef.current.forget(path);
      return resolvePath(path, { force: true, bypassBackoff: true });
    },
    [online, resolvePath],
  );

  const urisByPath = useMemo(() => {
    const next: Record<string, string> = {};
    if (peekLocalUri) {
      paths.forEach((path) => {
        const localUri = peekLocalUri(path);
        if (localUri) next[path] = localUri;
      });
    }
    Object.entries(stateByPath).forEach(([path, state]) => {
      if (state.uri) next[path] = state.uri;
    });
    return next;
  }, [paths, peekLocalUri, stateByPath]);

  const failuresByPath = useMemo(() => {
    const next: Record<string, ChatMediaAccessFailure> = {};
    Object.entries(stateByPath).forEach(([path, state]) => {
      if (state.failure) next[path] = state.failure;
    });
    return next;
  }, [stateByPath]);

  return {
    urisByPath,
    failuresByPath,
    localHydrationComplete: locallyHydratedPathKey === pathKey,
    visualPathCount: paths.length,
    reportLoadError,
    retry,
    resolvePath,
  };
};
