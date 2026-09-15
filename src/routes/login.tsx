import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { landingFor } from "@/auth/permissions";
import { AuroraFlow } from "@/components/AuroraFlow";


export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const startCoordinatorLogin = async () => {
    const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)).buffer);
    try {
      sessionStorage.setItem("cm_pkce_verifier", verifier);
      sessionStorage.setItem("cm_pkce_state", state);
    } catch { /* ignore */ }
    const { buildAuthorizeUrl } = await import("@/lib/campaign-manager.config");
    window.location.href = buildAuthorizeUrl({ origin: window.location.origin, challenge, state });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const role = await login(email, password);
    if (role) navigate({ to: landingFor(role) });
    else setError(true);
  };

  return (
    <div className="relative overflow-hidden flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="rozgar-blob rozgar-anim-a" style={{ top: "-10%", left: "-5%", width: "420px", height: "420px", background: "radial-gradient(circle at center, rgba(21,94,72,0.40), transparent 70%)" }} />
        <div className="rozgar-blob rozgar-anim-b" style={{ bottom: "-15%", right: "-10%", width: "480px", height: "480px", background: "radial-gradient(circle at center, rgba(16,185,129,0.40), transparent 70%)" }} />
        <div className="rozgar-blob rozgar-anim-c" style={{ top: "30%", right: "20%", width: "360px", height: "360px", background: "radial-gradient(circle at center, rgba(45,212,191,0.30), transparent 70%)" }} />
        <AuroraFlow />
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card/90 backdrop-blur-sm p-8 shadow-sm">

        <div className="flex flex-col items-center text-center">
          <div className="h-11 w-11 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Briefcase className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-foreground">Operation Rozgar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to Mission Control</p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="email">Email</label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(false); }}
              required
              aria-invalid={error || undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="password">Password (admin only)</label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              aria-invalid={error || undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>
          {error && (
            <p id="login-error" role="alert" className="text-xs text-rose-600">Not an authorised email, or wrong admin password.</p>
          )}
          <Button type="submit" className="w-full">Sign in</Button>
          <p className="text-xs text-muted-foreground text-center">Reviewers: sign in with your own email and leave the password blank. The password is only for the admin account — please don't use it to review calls.</p>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-4 space-y-2">
          <Button type="button" variant="outline" className="w-full" onClick={startCoordinatorLogin}>
            Coordinator sign-in (email code)
          </Button>
          <p className="text-xs text-muted-foreground text-center">Coordinators sign in with a one-time code sent to their email.</p>
        </div>
      </div>
    </div>
  );
}
