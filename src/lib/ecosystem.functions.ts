import { createServerFn } from "@tanstack/react-start";

export const fetchEcosystemData = createServerFn({ method: "GET" })
  .inputValidator((d: { state: string; district: string }) => d)
  .handler(async ({ data }) => {
    // Vineela pilot reads the Ecosystem View from Palak's Blue Dots Supabase;
    // everyone else stays on Google Sheets (fail-safe fallback on any error).
    try {
      const { usesSecondProject } = await import("./db.server");
      const { ecoBlueDotsAvailable, loadEcosystemFromBlueDots } = await import("./ecosystem.bluedot.server");
      if (usesSecondProject() && ecoBlueDotsAvailable()) {
        return await loadEcosystemFromBlueDots(data.state, data.district);
      }
    } catch { /* fall through to Sheets */ }
    const { loadEcosystem } = await import("./ecosystem.server");
    return await loadEcosystem(data.state, data.district);
  });
