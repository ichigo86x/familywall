import { DependencyList, useCallback, useEffect, useState } from "react";

/** While reloading, the previous data stays available so screens do not flash back to a spinner. */
type ResourceState<T> =
  | { status: "loading"; data: T | null; error: null }
  | { status: "error"; data: null; error: Error }
  | { status: "success"; data: T; error: null };

/**
 * Last data of each resource with a cache key, kept in memory for the session: a page opened again
 * shows it at once while the fresh copy loads in the background. Cleared at sign-out.
 */
const memory = new Map<string, unknown>();

export const clearResourceMemory = (): void => memory.clear();

export const useAsyncResource = <T,>(
  loader: () => Promise<T>,
  dependencies: DependencyList,
  cacheKey?: string
): ResourceState<T> & { reload: () => void } => {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ResourceState<T>>(() => ({
    status: "loading",
    data: cacheKey !== undefined && memory.has(cacheKey) ? (memory.get(cacheKey) as T) : null,
    error: null
  }));

  useEffect(() => {
    let active = true;
    setState((current) => ({
      status: "loading",
      data: current.data ?? (cacheKey !== undefined && memory.has(cacheKey) ? (memory.get(cacheKey) as T) : null),
      error: null
    }));

    void loader()
      .then((data) => {
        if (cacheKey !== undefined) {
          memory.set(cacheKey, data);
        }
        if (active) {
          setState({ status: "success", data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            data: null,
            error: error instanceof Error ? error : new Error("Unknown request failure")
          });
        }
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the loader's inputs as dependencies
  }, [reloadToken, cacheKey, ...dependencies]);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return {
    ...state,
    reload
  };
};
