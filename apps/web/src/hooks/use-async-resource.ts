import { DependencyList, useCallback, useEffect, useState } from "react";

/** While reloading, the previous data stays available so screens do not flash back to a spinner. */
type ResourceState<T> =
  | { status: "loading"; data: T | null; error: null }
  | { status: "error"; data: null; error: Error }
  | { status: "success"; data: T; error: null };

export const useAsyncResource = <T,>(
  loader: () => Promise<T>,
  dependencies: DependencyList
): ResourceState<T> & { reload: () => void } => {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({
    status: "loading",
    data: null,
    error: null
  });

  useEffect(() => {
    let active = true;
    setState((current) => ({ status: "loading", data: current.data, error: null }));

    void loader()
      .then((data) => {
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
  }, [reloadToken, ...dependencies]);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return {
    ...state,
    reload
  };
};
