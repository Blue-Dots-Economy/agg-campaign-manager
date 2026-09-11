import { createServerFn } from "@tanstack/react-start";

export const fetchEcosystemData = createServerFn({ method: "POST" })
  .inputValidator((d: { state: string; district: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { usesSecondProject } = await import("./db.server");
      const { ecoBlueDotsAvailable, loadEcosystemFromBlueDots } = await import("./ecosystem.bluedot.server");
      if (usesSecondProject() && ecoBlueDotsAvailable()) {
        return await loadEcosystemFromBlueDots(data.state, data.district);
      }
    } catch (e) {
      console.error("[ecosystem] Blue Dots load failed, falling back to sheet:", e);
    }
    const { loadEcosystem } = await import("./ecosystem.server");
    return await loadEcosystem(data.state, data.district);
  });
