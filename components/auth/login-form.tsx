"use client";

// Reusable themed credential form for operator and administrator sign-in.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { AuthShell, FieldMessage } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ adminOnly = false }: { adminOnly?: boolean }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(adminOnly ? "/api/auth/admin-login" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      const nextPath = new URL(window.location.href).searchParams.get("next");
      const safePath = nextPath?.startsWith("/") && !nextPath.startsWith("//") && !nextPath.startsWith("/api/")
        ? nextPath
        : "/dashboard";
      router.replace(safePath);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title={adminOnly ? "Administrator sign in" : "Welcome back"}
      description={adminOnly ? "Sign in to manage all geographical areas and system settings." : "Sign in to view your geographical area's meter operations."}
      footer={adminOnly ? <>Operator account? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in here</Link></> : <>New to the operations center? <Link href="/signup" className="font-semibold text-primary hover:underline">Create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</div>}
        <div className="space-y-1.5">
          <label htmlFor="login-identifier" className="text-sm font-medium">Username or email</label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="login-identifier" autoComplete="username" maxLength={254} required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Username or email address" className="pl-9" />
          </div>
          <FieldMessage>Enter the username or email address on your account.</FieldMessage>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="login-password" className="text-sm font-medium">Password</label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" className="pl-9 pr-10" />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <FieldMessage>Use the password you created when registering.</FieldMessage>
        </div>
        <Button type="submit" disabled={submitting || !identifier || !password} className="w-full">
          {submitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Signing in…</> : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
