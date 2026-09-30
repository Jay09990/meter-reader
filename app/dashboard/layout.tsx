import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AutoRefreshProvider } from "@/lib/auto-refresh";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

// Dashboard layout wires shared providers around the responsive client shell.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AutoRefreshProvider>
      <DashboardShell>{children}</DashboardShell>
    </AutoRefreshProvider>
  );
}
