import * as React from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRevalidator,
} from "react-router";

import type { Route } from "./+types/root";
import { Toaster } from "./components/ui/toaster/toaster";
import colorSchemeApi from "@dazl/color-scheme/client?url";

import "./styles/reset.css";
import "./styles/global.css";
import "./styles/tokens/keyframes.css";
import "./styles/tokens/animations.css";
import "./styles/tokens/colors.css";
import "./styles/tokens/decorations.css";
import "./styles/tokens/spacings.css";
import "./styles/tokens/typography.css";
import "./styles/theme.css";
import "./styles/error-boundary.css";
import { useColorScheme } from "@dazl/color-scheme/react";
import favicon from "/favicon.svg";
import { syncTokenToCookie, getValidToken, getToken } from "~/lib/auth.client";
import { consumeStaleInitialData } from "~/lib/client-auth-loader";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "icon",
    href: favicon,
    type: "image/svg+xml",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&family=Heebo:wght@400;500;600&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { rootCssClass, resolvedScheme } = useColorScheme();
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning className={rootCssClass} style={{ colorScheme: resolvedScheme }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <script src={colorSchemeApi}></script>
        <Links />
      </head>
      <body>
        {children}
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  React.useEffect(() => {
    // Sync localStorage token → cookie on app boot
    syncTokenToCookie();

    // Keep the session fresh: refresh the token whenever it is about to
    // expire. Timers are paused while the computer sleeps, so also check
    // when the tab becomes visible again.
    const refreshIfNeeded = () => {
      // Only refresh if user currently has a token (is logged in)
      if (getToken()) {
        void getValidToken();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfNeeded();
    };

    const CHECK_INTERVAL_MS = 5 * 60 * 1000;
    const intervalId = setInterval(refreshIfNeeded, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // If the first page was server-rendered with an expired token, its data is
  // the empty signed-out fallback. Once the client has refreshed the token,
  // reload the data. Runs after every render but acts at most once.
  const revalidator = useRevalidator();
  React.useEffect(() => {
    if (revalidator.state === "idle" && consumeStaleInitialData()) {
      void revalidator.revalidate();
    }
  });

  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "אופס!";
  let details = "אירעה שגיאה בלתי צפויה.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "שגיאה";
    details = error.status === 404 ? "הדף המבוקש לא נמצא." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="error-boundary">
      <div className="error-container">
        <h1 className="error-title">{message}</h1>
        <p className="error-details">{details}</p>

        {stack && (
          <div className="error-stack-wrapper">
            <button
              onClick={() => {
                navigator.clipboard.writeText(stack || "");
              }}
              className="error-copy-button"
            >
              העתק
            </button>
            <pre className="error-stack-pre">
              <code>{stack}</code>
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
