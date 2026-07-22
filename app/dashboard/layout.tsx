import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AutoRefreshProvider } from "@/lib/auto-refresh";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
   <AutoRefreshProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex font-sans antialiased transition-colors">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AutoRefreshProvider>
  );
}
