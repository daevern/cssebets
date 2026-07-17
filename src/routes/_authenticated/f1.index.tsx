import { createFileRoute } from "@tanstack/react-router";
import { F1SeasonPage } from "@/features/f1/pages/F1SeasonPage";

export const Route = createFileRoute("/_authenticated/f1/")({
  component: F1SeasonPage,
});
