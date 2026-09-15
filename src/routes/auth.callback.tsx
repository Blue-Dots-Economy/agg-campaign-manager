import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/auth/context";
import { landingFor } from "@/auth/permissions";
import { exchangeCoordinatorCode } from "@/lib/campaign-manager.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === "string" ? s.code : undefined,
    state: typeof s.state === "string" ? s.state : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const { code, state, error: oidcError } = Route.useSearch();
  const navigate = useNavigate();
  const { loginCoordinator } = useAuth();
  const exchange = useServerFn(exchangeCoordinatorCode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (oidcError) throw new Error("Sign-in was cancelled or failed: " + oidcError);
        if (!code) throw new Error("Missing authorization code.");
        const savedState = sessionStorage.getItem("cm_pkce_state");
        if (!state || !savedState || state !== savedState) throw new Error("State mismatch — please try signing in again.");
        const verifier = sessionStorage.getItem("cm_pkce_verifier");
        if (!verifier) throw new Error("Missing PKCE verifier — please try signing in again.");
        const identity = await exchange({ data: { code, codeVerifier: verifier, redirectUri: window.location.origin + "/auth/callback" } });
        sessionStorage.removeItem("cm_pkce_verifier");
        sessionStorage.removeItem("cm_pkce_state");
        loginCoordinator(identity);
        navigate({ to: landingFor("coordinator") });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      {error ? (
        <div className="max-w-sm text-center space-y-3">
          <p className="text-sm text-rose-600">{error}</p>
          <a href="/login" className="text-sm underline">Back to sign in</a>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Signing you in…</div>
      )}
    </div>
  );
}
