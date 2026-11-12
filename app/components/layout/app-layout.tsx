import * as React from "react";
import { LogOut } from "lucide-react";
import { SidebarTrigger } from "~/components/ui/sidebar/sidebar";
import { ColorSchemeToggle } from "~/components/ui/color-scheme-toggle/color-scheme-toggle";
import { useLogout } from "./app-sidebar";
import styles from "./app-layout.module.css";

interface AppLayoutProps {
  /**
   * The main content to display
   * @important
   */
  children: React.ReactNode;
  /**
   * The title to display in the header
   * @important
   */
  title?: string;
  /**
   * Extra content rendered inline with the header title (e.g., a course selector)
   */
  headerExtra?: React.ReactNode;
}

/**
 * A page's header and content area. The sidebar around it is rendered once by
 * the shared layout route (`routes/app-shell.tsx`), so pages using AppLayout
 * must be registered under that route in `routes.ts`.
 */
export function AppLayout({ children, title = "מערכת ניהול לימודים", headerExtra }: AppLayoutProps) {
  const logout = useLogout();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerActions}>
          <button type="button" onClick={logout} className={styles.headerLogoutBtn} title="יציאה">
            <LogOut size={18} />
          </button>
          <ColorSchemeToggle />
          <SidebarTrigger />
        </div>
        <div className={styles.headerTitleRow}>
          <h1 className={styles.headerTitle}>{title}</h1>
          {headerExtra && <div className={styles.headerExtra}>{headerExtra}</div>}
        </div>
      </header>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
