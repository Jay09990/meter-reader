"use client";

// Account registration with explicit GA confirmation and inline password guidance.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { AuthShell, FieldMessage } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMAIL_PATTERN, EMAIL_MAX_LENGTH, USERNAME_PATTERN, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, getPasswordRuleStatus, normalizeEmail } from "@/lib/auth-validation";

interface GaOption { id: string; name: string }
type SignupField = "email" | "username" | "password" | "confirmPassword" | "gaId";

const PASSWORD_RULES = [
  ["length", `Between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`],
  ["uppercase", "At least one uppercase letter"],
  ["lowercase", "At least one lowercase letter"],
  ["number", "At least one number"],
  ["symbol", "At least one symbol (for example ! or #)"],
  ["noWhitespace", "No spaces or whitespace"],
] as const;

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [gaId, setGaId] = useState("");
  const [pendingGaId, setPendingGaId] = useState("");
  const [gaOptions, setGaOptions] = useState<GaOption[]>([]);
  const [loadingGas, setLoadingGas] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SignupField, string>>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/gas", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load geographical areas.");
        const data: unknown = await response.json();
        if (Array.isArray(data)) setGaOptions(data.filter((item): item is GaOption => item && typeof item.id === "string" && typeof item.name === "string"));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load geographical areas."))
      .finally(() => setLoadingGas(false));
  }, []);

  const passwordRules = useMemo(() => getPasswordRuleStatus(password), [password]);
  const emailValid = EMAIL_PATTERN.test(normalizeEmail(email)) && email.length <= EMAIL_MAX_LENGTH;
  const usernameValid = USERNAME_PATTERN.test(username) && username.length <= 32;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const selectedGaName = gaOptions.find((ga) => ga.id === gaId)?.name;
  const pendingGaName = gaOptions.find((ga) => ga.id === pendingGaId)?.name;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    if (!emailValid || !usernameValid || Object.values(passwordRules).some((ok) => !ok) || !passwordsMatch || !gaId) {
      setFieldErrors({
        ...(!emailValid ? { email: "Enter a valid email address." } : {}),
        ...(!usernameValid ? { username: "Enter a valid username." } : {}),
        ...(Object.values(passwordRules).some((ok) => !ok) ? { password: "Meet every password rule listed below." } : {}),
        ...(!passwordsMatch ? { confirmPassword: "Passwords do not match." } : {}),
        ...(!gaId ? { gaId: "Select and confirm a geographical area." } : {}),
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password, confirmPassword, gaId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFieldErrors(data.fields ?? {});
        throw new Error(data.error || "Unable to create your account.");
      }
      // Load the protected dashboard after the registration response sets its session cookie.
      window.location.replace("/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create your account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description="Your account will show data for the geographical area you select."
      footer={<>Already registered? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</div>}
        <div className="space-y-1.5">
          <label htmlFor="signup-email" className="text-sm font-medium">Email address</label>
          <Input id="signup-email" type="email" autoComplete="email" maxLength={EMAIL_MAX_LENGTH} required value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(fieldErrors.email) || (email.length > 0 && !emailValid)} placeholder="name@example.com" />
          <FieldMessage error={Boolean(fieldErrors.email) || (email.length > 0 && !emailValid)}>{fieldErrors.email ?? (email.length === 0 ? "Use a valid address like name@example.com." : emailValid ? "Email format looks good." : "Enter a valid email address like name@example.com.")}</FieldMessage>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="signup-username" className="text-sm font-medium">Username</label>
          <Input id="signup-username" autoComplete="username" maxLength={32} required value={username} onChange={(event) => setUsername(event.target.value)} aria-invalid={Boolean(fieldErrors.username) || (username.length > 0 && !usernameValid)} placeholder="Choose a username" />
          <FieldMessage error={Boolean(fieldErrors.username) || (username.length > 0 && !usernameValid)}>{fieldErrors.username ?? "3–32 letters, numbers, dots, underscores, or hyphens."}</FieldMessage>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="signup-ga" className="text-sm font-medium">Geographical area</label>
          <select id="signup-ga" value={gaId} onChange={(event) => { if (event.target.value) setPendingGaId(event.target.value); }} disabled={loadingGas || gaOptions.length === 0} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" required>
            <option value="">{loadingGas ? "Loading areas…" : gaOptions.length ? "Choose your area" : "No areas available"}</option>
            {gaOptions.map((ga) => <option key={ga.id} value={ga.id}>{ga.name}</option>)}
          </select>
          <FieldMessage error={Boolean(fieldErrors.gaId)}>{fieldErrors.gaId ?? (selectedGaName ? `Confirmed: ${selectedGaName}. This selection controls the data you can access.` : "Choose an area, then confirm your selection.")}</FieldMessage>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="signup-password" className="text-sm font-medium">Password</label>
          <div className="relative">
            <Input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} required value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(fieldErrors.password)} placeholder="Create a strong password" className="pr-10" />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          {fieldErrors.password && <FieldMessage error>{fieldErrors.password}</FieldMessage>}
          <ul className="grid grid-cols-1 gap-1 pt-1 sm:grid-cols-2" aria-label="Password rules">
            {PASSWORD_RULES.map(([key, label]) => {
              const passed = passwordRules[key];
              return <li key={key} className={`flex items-center gap-1.5 text-[11px] ${passed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {passed ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-current" />}{label}
              </li>;
            })}
          </ul>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="signup-confirm-password" className="text-sm font-medium">Confirm password</label>
          <div className="relative">
            <Input id="signup-confirm-password" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={Boolean(fieldErrors.confirmPassword) || (confirmPassword.length > 0 && !passwordsMatch)} placeholder="Enter your password again" className="pr-10" />
            <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          {confirmPassword && <FieldMessage error={!passwordsMatch}>{fieldErrors.confirmPassword ?? (passwordsMatch ? "Passwords match." : "Passwords do not match.")}</FieldMessage>}
        </div>
        <Button type="submit" disabled={submitting || loadingGas || gaOptions.length === 0} className="w-full">
          {submitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Creating account…</> : "Create account"}
        </Button>
      </form>

      {pendingGaId && pendingGaName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingGaId(""); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="confirm-ga-title" className="w-full max-w-sm rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
            <h2 id="confirm-ga-title" className="text-lg font-semibold">Confirm geographical area</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your account will be limited to data for <strong className="text-foreground">{pendingGaName}</strong>.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPendingGaId("")}>Change</Button>
              <Button type="button" onClick={() => { setGaId(pendingGaId); setPendingGaId(""); setFieldErrors((current) => ({ ...current, gaId: undefined })); }}><Check className="mr-2 h-4 w-4" />Confirm area</Button>
            </div>
          </section>
        </div>
      )}
    </AuthShell>
  );
}
