/**
 * Client-side auth utilities for React Router v7.
 *
 * React Router v7's `clientLoader` / `clientAction` can call `serverLoader()`
 * / `serverAction()` to re-run the server-side handler, but there's no
 * built-in way to inject custom headers into those internal fetch calls.
 *
 * We work around this by temporarily patching `globalThis.fetch` to inject
 * the Authorization header into every same-origin request.
 *
 * Usage in a protected route:
 *
 *   import { makeClientLoader, makeClientAction } from "~/lib/client-auth-loader";
 *   export const clientLoader = makeClientLoader<typeof loader>();
 *   clientLoader.hydrate = true;
 *   export const clientAction = makeClientAction<typeof action>();
 */

import { redirect } from "react-router";
import { getToken, restoreSession } from "~/lib/auth.client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

/** Infer the resolved return type of an async function. */
type Awaited<T> = T extends PromiseLike<infer U> ? U : T;
type ReturnData<T extends AnyFn> = Awaited<ReturnType<T>>;

/**
 * Temporarily patches globalThis.fetch to inject the Authorization header
 * on same-origin requests, calls the given async fn, then restores fetch.
 */
async function withAuthFetch<T>(token: string, fn: () => Promise<T>): Promise<T> {
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
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export function makeClientLoader<TLoader extends AnyFn>() {
  const clientLoader = async ({
    serverLoader,
  }: {
    serverLoader: () => Promise<ReturnData<TLoader>>;
  }): Promise<ReturnData<TLoader>> => {
    let token = getToken();

    // If no access token in localStorage, try to restore from refresh token
    if (!token) {
      token = await restoreSession();
    }

    if (!token) {
      throw redirect("/login");
    }

    return withAuthFetch(token, serverLoader);
  };

  clientLoader.hydrate = true as const;

  return clientLoader;
}

export function makeClientAction<TAction extends AnyFn>() {
  const clientAction = async ({
    serverAction,
  }: {
    serverAction: () => Promise<ReturnData<TAction>>;
  }): Promise<ReturnData<TAction>> => {
    let token = getToken();

    // If no access token, try to restore from refresh token
    if (!token) {
      token = await restoreSession();
    }

    if (!token) {
      throw redirect("/login");
    }

    return withAuthFetch(token, serverAction);
  };

  return clientAction;
}
