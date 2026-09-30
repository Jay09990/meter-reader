// Shared presentation frame for account creation and sign-in screens.
import Link from "next/link";
import { Activity } from "lucide-react";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md">
        <Link href="/login" className="mb-8 flex items-center justify-center gap-2 text-sm font-semibold tracking-wide text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </span>
          AMR Operations Center
        </Link>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
          <div className="mb-6 space-y-1 text-center">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
        <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>
      </section>
    </main>
  );
}

export function FieldMessage({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p className={`mt-1.5 text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>{children}</p>;
}
