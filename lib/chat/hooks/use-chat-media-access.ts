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
}: UseChatMediaAccessOptions) => {
  const resolverRef = useRef<ChatMediaResolver>(new CachedChatMediaResolver());
  const [stateByPath, setStateByPath] = useState<Record<string, MediaAccessState>>({});
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
      if (!online || !path.trim()) return null;
      const result = await resolverRef.current.resolve(path, signUrl, options);
      applyResult(path, result);
      return result;
    },
    [applyResult, online, signUrl],
  );

  useEffect(() => {
    if (!online || paths.length === 0) return;
    let cancelled = false;

    void Promise.all(
      paths.map(async (path) => {
        const knownUri = resolverRef.current.getKnownUri(path);
        if (knownUri) {
          return {
            path,
            result: { status: 'ready', uri: knownUri, source: 'cache' } as const,
          };
        }
        return { path, result: await resolverRef.current.resolve(path, signUrl) };
      }),
    ).then((entries) => {
      if (cancelled) return;
      entries.forEach(({ path, result }) => applyResult(path, result));
    });

    return () => {
      cancelled = true;
    };
  }, [applyResult, online, pathKey, signUrl]);

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
    Object.entries(stateByPath).forEach(([path, state]) => {
      if (state.uri) next[path] = state.uri;
    });
    return next;
  }, [stateByPath]);

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
    reportLoadError,
    retry,
    resolvePath,
  };
};
