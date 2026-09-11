import { createServerFn } from "@tanstack/react-start";

export const fetchEcosystemData = createServerFn({ method: "POST" })
  .inputValidator((d: { state: string; district: string }) => d)
  .handler(async ({ data }) => {
    const dbg: string[] = [];
    try {
      const { usesSecondProject } = await import("./db.server");
      const { ecoBlueDotsAvailable, loadEcosystemFromBlueDots } = await import("./ecosystem.bluedot.server");
      const usp = usesSecondProject();
      const av = ecoBlueDotsAvailable();
      dbg.push("usesSecondProject=" + usp, "ecoBlueDotsAvailable=" + av);
      if (usp && av) {
        return await loadEcosystemFromBlueDots(data.state, data.district);
      }
    } catch (e) {
      dbg.push("BLUEDOT_ERROR: " + String((e && (e as Error).message) ? (e as Error).message : e));
    }
    const { loadEcosystem } = await import("./ecosystem.server");
    const sheet = await loadEcosystem(data.state, data.district);
    return { ...sheet, unmapped: [...dbg, ...(sheet.unmapped || [])] };
  });
