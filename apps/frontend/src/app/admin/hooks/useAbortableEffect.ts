/**
 * Custom hook to handle AbortController for API calls
 * Prevents memory leaks and race conditions when component unmounts
 *
 * Usage:
 * ```typescript
 * useAbortableEffect((signal) => {
 *   async function loadData() {
 *     const data = await fetchAPI({ signal });
 *     if (!signal.aborted) {
 *       setState(data);
 *     }
 *   }
 *   loadData();
 * }, [dependency1, dependency2]);
 * ```
 */

import { useEffect, DependencyList } from 'react';

export function useAbortableEffect(
  effect: (signal: AbortSignal) => void | Promise<void>,
  deps?: DependencyList
) {
  useEffect(() => {
    const controller = new AbortController();

    effect(controller.signal);

    // Cleanup: abort request when component unmounts or deps change
    return () => {
      controller.abort();
    };
  }, deps);
}
