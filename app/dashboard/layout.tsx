import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AutoRefreshProvider } from "@/lib/auto-refresh";

// Dashboard layout wires shared providers around the responsive client shell.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AutoRefreshProvider>
      <DashboardShell>{children}</DashboardShell>
    </AutoRefreshProvider>
  );
}