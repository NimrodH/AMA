/**
 * Client-side auth loader utility.
 *
 * React Router v7's `clientLoader` can call `serverLoader()` to re-run the
 * server loader, but there's no built-in way to inject custom headers into
 * that call. We work around this by temporarily patching `globalThis.fetch`
 * to inject the Authorization header into every same-origin request that RR7
 * makes internally when `serverLoader()` is called.
 *
 * Usage in a protected route:
 *
 *   import { makeClientLoader } from "~/lib/client-auth-loader";
 *   export const clientLoader = makeClientLoader<typeof loader>();
 *   clientLoader.hydrate = true;
 */

import { redirect } from "react-router";
import { getToken } from "~/lib/auth.client";

type ServerLoaderFn<T> = () => Promise<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

/** Infer the resolved return type of an async function. */
type Awaited<T> = T extends PromiseLike<infer U> ? U : T;
type ReturnData<T extends AnyFn> = Awaited<ReturnType<T>>;

export function makeClientLoader<TLoader extends AnyFn>() {
  const clientLoader = async ({
    serverLoader,
  }: {
    serverLoader: ServerLoaderFn<ReturnData<TLoader>>;
  }): Promise<ReturnData<TLoader>> => {
    const token = getToken();

    if (!token) {
      // No token — use React Router's redirect to navigate to login.
      // This works correctly in both regular and iframe (preview) environments.
      throw redirect("/login");
    }

    // Temporarily patch globalThis.fetch to inject the Authorization header
    // on same-origin requests that React Router makes internally when
    // serverLoader() is called.
    const originalFetch = globalThis.fetch;

    globalThis.fetch = function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      const isSameOrigin =
        url.startsWith("/") || url.startsWith(window.location.origin);

      if (isSameOrigin) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined)
        );
        headers.set("Authorization", `Bearer ${token}`);
        const newInit: RequestInit = { ...(init ?? {}), headers };
        if (input instanceof Request) {
          return originalFetch(new Request(input, newInit));
        }
        return originalFetch(input, newInit);
      }

      return originalFetch(input, init);
    };

    try {
      return await serverLoader();
    } finally {
      globalThis.fetch = originalFetch;
    }
  };

  clientLoader.hydrate = true as const;

  return clientLoader;
}
