"use client";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";

const APP_ROUTES = ["/dashboard", "/profile", "/analytics", "/admin"];

export default function SidebarShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const hasSidebar = !!user && APP_ROUTES.some(r => pathname?.startsWith(r));

  return (
    <div className={hasSidebar ? "app-shell sidebar-offset" : "app-shell"}>
      {children}
    </div>
  );
}
