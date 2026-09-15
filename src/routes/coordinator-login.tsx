import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuroraFlow } from "@/components/AuroraFlow";

export const Route = createFileRoute("/coordinator-login")({ component: CoordinatorLogin });

function CoordinatorLogin() {
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

  return (
    <div className="relative overflow-hidden flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="rozgar-blob rozgar-anim-a" style={{ top: "-10%", left: "-5%", width: "420px", height: "420px", background: "radial-gradient(circle at center, rgba(21,94,72,0.40), transparent 70%)" }} />
        <div className="rozgar-blob rozgar-anim-b" style={{ bottom: "-15%", right: "-10%", width: "480px", height: "480px", background: "radial-gradient(circle at center, rgba(16,185,129,0.40), transparent 70%)" }} />
        <AuroraFlow />
      </div>
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card/90 backdrop-blur-sm p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="h-11 w-11 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Mail className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-foreground">Coordinator sign-in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in with a one-time code sent to your registered email — no password needed.</p>
        </div>
        <div className="mt-6">
          <Button type="button" className="w-full" onClick={startCoordinatorLogin}>Sign in with email code</Button>
        </div>
      </div>
    </div>
  );
}
