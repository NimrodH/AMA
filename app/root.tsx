import * as React from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import { Toaster } from "./components/ui/toaster/toaster";
import { getSession } from "./lib/auth.server";
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

/**
 * Runs synchronously in <head> before hydration.
 * Reads the JWT from localStorage and writes it to document.cookie
 * so the server receives it on the very first GET request after login.
 */
const TOKEN_SYNC_SCRIPT = `
  (function() {
    try {
      var token = localStorage.getItem('auth_token');
      if (token) {
        document.cookie = 'auth_token=' + encodeURIComponent(token) + '; path=/; max-age=604800; samesite=lax';
      }
    } catch(e) {}
  })()
`;

export function Layout({ children }: { children: React.ReactNode }) {
  const { rootCssClass, resolvedScheme } = useColorScheme();
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning className={rootCssClass} style={{ colorScheme: resolvedScheme }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        {/* Sync localStorage token → cookie before any navigation so server loaders receive auth */}
        <script dangerouslySetInnerHTML={{ __html: TOKEN_SYNC_SCRIPT }} />
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

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  return {
    session: session
      ? { studentName: session.studentName, accountType: session.accountType }
      : null,
  };
}

export default function App() {
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
