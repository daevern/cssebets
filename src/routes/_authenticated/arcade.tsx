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
    <div className="mx-auto w-full max-w-4xl px-3 pt-3 md:px-6 md:pt-6">
      <Outlet />

      <PageFooter className="!mt-3" />

      {/* Spacer clears the fixed console + bottom nav without pushing the
          footer away from the page content. */}
      <div className="h-[210px] md:h-[150px]" aria-hidden />
    </div>
  );
}
