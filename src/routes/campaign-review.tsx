import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/campaign-review")({
  component: () => <Outlet />,
});
