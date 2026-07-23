import { useEffect, useState } from "react";

type State<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: Error };

/**
 * Minimal async read. Loading and error are real, rendered states — the store
 * resolves off a timer today and off the network later, and the difference must
 * not reach the components.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): State<T> {
  const [state, setState] = useState<State<T>>({ status: "loading", data: null, error: null });

  useEffect(() => {
    let live = true;
    setState({ status: "loading", data: null, error: null });
    fn()
      .then((data) => live && setState({ status: "ready", data, error: null }))
      .catch(
        (error: unknown) =>
          live &&
          setState({
            status: "error",
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
          }),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
