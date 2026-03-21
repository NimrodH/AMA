import * as React from "react";
import { NavLink, useNavigate } from "react-router";
import { clearToken } from "~/lib/auth.client";
import { Home, FileText, BookOpen, GraduationCap, Settings, Layers, FileSearch, LogOut } from "lucide-react";
import classNames from "classnames";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
} from "~/components/ui/sidebar/sidebar";
import { ColorSchemeToggle } from "~/components/ui/color-scheme-toggle/color-scheme-toggle";
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

const navigationItems = [
  {
    title: "דף הבית",
    url: "/",
    icon: Home,
  },
  {
    title: "מקורות לימוד",
    url: "/sources",
    icon: FileText,
  },
  {
    title: "בניית כרטיסים",
    url: "/cards",
    icon: BookOpen,
  },
  {
    title: "שינון כרטיסים",
    url: "/learn",
    icon: Layers,
  },
  {
    title: "ניתוח מאמר",
    url: "/article-analysis",
    icon: FileSearch,
  },
  {
    title: "מבחנים",
    url: "/exams",
    icon: GraduationCap,
  },
  {
    title: "הגדרות",
    url: "/settings",
    icon: Settings,
  },
];

function LogoutButton() {
  const navigate = useNavigate();

  function handleLogout() {
    clearToken();
    navigate("/login");
  }

  return (
    <button type="button" onClick={handleLogout} className={styles.logoutBtn} title="יציאה">
      <LogOut size={16} />
      <span>יציאה</span>
    </button>
  );
}

function HeaderLogoutButton() {
  const navigate = useNavigate();

  function handleLogout() {
    clearToken();
    navigate("/login");
  }

  return (
    <button type="button" onClick={handleLogout} className={styles.headerLogoutBtn} title="יציאה">
      <LogOut size={18} />
    </button>
  );
}

export function AppLayout({ children, title = "מערכת ניהול לימודים", headerExtra }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className={styles.layout}>
        <Sidebar side="right" variant="sidebar">
          <SidebarHeader>
            <div style={{ padding: "var(--space-4)", textAlign: "center" }}>
              <h2 style={{ font: "var(--font-heading)", color: "var(--color-accent-11)", margin: 0 }}>
                מערכת הלימוד שלי
              </h2>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>ניווט ראשי</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink to={item.url}>
                          <item.icon style={{ marginLeft: "var(--space-2)" }} />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <LogoutButton />
          </SidebarFooter>
        </Sidebar>

        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerActions}>
              <HeaderLogoutButton />
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
      </div>
    </SidebarProvider>
  );
}
