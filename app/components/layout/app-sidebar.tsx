import * as React from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { clearToken } from "~/lib/auth.client";
import { Home, FileText, BookOpen, GraduationCap, Settings, Layers, FileSearch, LogOut, NotebookText } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "~/components/ui/sidebar/sidebar";
import styles from "./app-layout.module.css";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  /** If true, only visible to students (not guests) */
  studentOnly?: boolean;
}

const navigationItems: NavItem[] = [
  { title: "דף הבית", url: "/", icon: Home },
  { title: "מקורות לימוד", url: "/sources", icon: FileText },
  { title: "בניית כרטיסים", url: "/cards", icon: BookOpen, studentOnly: true },
  { title: "שינון כרטיסים", url: "/learn", icon: Layers },
  { title: "ניתוח מאמר", url: "/article-analysis", icon: FileSearch },
  { title: "סיכומים", url: "/summary", icon: NotebookText },
  { title: "מבחנים", url: "/exams", icon: GraduationCap },
  { title: "הגדרות", url: "/settings", icon: Settings, studentOnly: true },
];

export function useLogout() {
  const navigate = useNavigate();
  return React.useCallback(() => {
    clearToken();
    navigate("/login");
  }, [navigate]);
}

/**
 * The app's navigation sidebar. Rendered once by the shared layout route
 * (`routes/app-shell.tsx`), so it stays mounted while moving between pages.
 */
export function AppSidebar({ accountType }: { accountType?: "student" | "guest" }) {
  const isGuest = accountType === "guest";
  const visibleNavItems = navigationItems.filter((item) => !item.studentOnly || !isGuest);
  const logout = useLogout();

  // The sidebar no longer remounts on navigation, so close the mobile sheet
  // when the page changes.
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  React.useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return (
    <Sidebar side="right" variant="sidebar">
      <SidebarHeader>
        <div style={{ padding: "var(--space-4)", textAlign: "center" }}>
          <h2 style={{ font: "var(--font-heading)", color: "var(--color-accent-11)", margin: 0 }}>מערכת הלימוד שלי</h2>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>ניווט ראשי</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
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
        <button type="button" onClick={logout} className={styles.logoutBtn} title="יציאה">
          <LogOut size={16} />
          <span>יציאה</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
