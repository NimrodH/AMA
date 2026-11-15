import { useSyncExternalStore } from "react";
import { isInitialDataSettled, subscribeInitialDataSettled } from "~/lib/client-auth-loader";

/**
 * True while the first page's loader data may still be the empty signed-out
 * fallback (the server rendered it with an expired or missing token and the
 * client has not finished reloading it yet). Always true during SSR and
 * hydration, so the server HTML and the first client render match.
 *
 * Use it together with a "data is empty" check, e.g.
 * `pending && !loaderData.studentId`, so pages with valid data render normally.
 */
export function useInitialDataPending(): boolean {
  return !useSyncExternalStore(subscribeInitialDataSettled, isInitialDataSettled, () => false);
}
