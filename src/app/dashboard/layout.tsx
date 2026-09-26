import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
