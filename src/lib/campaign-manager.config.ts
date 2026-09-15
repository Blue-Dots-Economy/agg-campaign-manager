// Public (non-secret) OIDC config for the coordinator login. Client-safe.
export const CM_UAT_PUBLIC = {
  keycloak: "https://auth-bluedots.bluedotseconomy.org/auth",
  realm: "bluedots",
  clientId: "campaign-manager",
  scope: "openid profile email",
};

export function buildAuthorizeUrl(opts: { origin: string; challenge: string; state: string }): string {
  const c = CM_UAT_PUBLIC;
  const p = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId,
    redirect_uri: `${opts.origin}/auth/callback`,
    scope: c.scope,
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
  });
  return `${c.keycloak}/realms/${c.realm}/protocol/openid-connect/auth?${p.toString()}`;
}
