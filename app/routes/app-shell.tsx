import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import type { Route } from "./+types/app-shell";
import { SidebarProvider } from "~/components/ui/sidebar/sidebar";
import { AppSidebar } from "~/components/layout/app-sidebar";
import { getSession } from "~/lib/auth.server";
import { makeClientLoader } from "~/lib/client-auth-loader";
import styles from "~/components/layout/app-layout.module.css";

/**
 * Shared layout route for the signed-in pages. It renders the sidebar once,
 * so moving between pages only swaps the page content (the sidebar is not
 * remounted). Its loader runs on the first load, not on every navigation.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  return { accountType: (session?.accountType ?? "student") as "student" | "guest" };
}

export const clientLoader = makeClientLoader<typeof loader>();
clientLoader.hydrate = true;

/**
 * The account type doesn't change while moving between pages, so skip this
 * loader on plain navigations. It still reloads after a form submission and
 * on an explicit revalidate (same URL), e.g. after a token refresh.
 */
export function shouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod || currentUrl.href === nextUrl.href) return defaultShouldRevalidate;
  return false;
}

export default function AppShell({ loaderData }: Route.ComponentProps) {
  return (
    <SidebarProvider>
      <div className={styles.layout}>
        <AppSidebar accountType={loaderData.accountType} />
        <Outlet />
      </div>
    </SidebarProvider>
  );
}
