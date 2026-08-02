import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageFooter } from "@/components/ui/page-footer";

export const Route = createFileRoute("/_authenticated/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade — cssebets" },
      {
        name: "description",
        content: "Plinko drops, Mini Roulette spins and Treasure Grid rounds — provably fair.",
      },
      { property: "og:title", content: "Arcade — cssebets" },
      {
        property: "og:description",
        content: "Plinko drops, Mini Roulette spins and Treasure Grid rounds — provably fair.",
      },
    ],
  }),
  component: ArcadeLayout,
});

function ArcadeLayout() {
  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-24 pt-3 md:px-6 md:pt-6">


      <Outlet />

      <PageFooter />
    </div>
  );
}
