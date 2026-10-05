# Roadmap

- [x] Sapijodzi donation flow: `/donera` form, Zeffy prefill handoff, webhook, CSV to Agnes, DB tables
- [x] ATLAS urgency score: `atlas_cohort_members` migration + optional urgency in
      `atlasBuildCohort` + planner inputs and members table in `/atlas`
- [ ] Donation flow config — needs the user to add secrets: `ZEFFY_API_KEY`, `ZEFFY_WEBHOOK_TOKEN`
      (same value pasted into Zeffy's webhook config), `RESEND_API_KEY`,
      `ZEFFY_FORM_ONETIME_URL`, `ZEFFY_FORM_MONTHLY_URL`
