import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/arcade/")({
  beforeLoad: () => {
    throw redirect({ to: "/arcade/plinko" });
  },
});
