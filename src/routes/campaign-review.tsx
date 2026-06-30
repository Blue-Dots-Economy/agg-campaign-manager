import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/campaign-review")({
  component: () => {
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    // Show the index list when at /campaign-review exactly; otherwise render the detail outlet.
    if (pathname === "/campaign-review" || pathname === "/campaign-review/") {
      // Defer to the index route file
      return <Outlet />;
    }
    return <Outlet />;
  },
});

// Unused helper to keep Link import valid in case of refactors.
void Link;
