import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * True on screens narrower than the mobile breakpoint.
 *
 * Uses the media query result, not `window.innerWidth`: on phones,
 * `innerWidth` grows to the page's width when the page is wider than the
 * screen (for example while the desktop sidebar from the first render is still
 * shown), so it would keep the desktop layout on a phone.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
