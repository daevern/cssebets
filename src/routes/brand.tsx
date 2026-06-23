import { createFileRoute } from "@tanstack/react-router";
import {
  CsseLogo,
  CsseMark,
  CsseWordmark,
  CsseAppIcon,
  BrandText,
} from "@/components/brand/CsseMark";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/brand")({
  head: () => ({
    meta: [
      { title: "Brand — CSSEBets" },
      {
        name: "description",
        content:
          "CSSEBets brand identity: logo system, color palette, typography, and usage guidelines.",
      },
    ],
  }),
  component: BrandPage,
});

const PALETTE = [
  { name: "Surface", token: "--background", value: "oklch(0.16 0.02 250)", hex: "#0B1220" },
  { name: "Card", token: "--card", value: "oklch(0.21 0.025 255)", hex: "#161D2F" },
  { name: "Foreground", token: "--foreground", value: "oklch(0.97 0.01 250)", hex: "#F3F5FA" },
  { name: "Brand Green", token: "--primary", value: "oklch(0.78 0.19 145)", hex: "#22E08A" },
  { name: "Muted", token: "--muted-foreground", value: "oklch(0.72 0.02 250)", hex: "#A6ADBE" },
  { name: "Border", token: "--border", value: "oklch(0.32 0.025 255)", hex: "#2A3247" },
];

function Section({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      {kicker ? (
        <p className="text-xs uppercase tracking-[0.22em] text-primary">{kicker}</p>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function BrandPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-12 space-y-14">
        {/* Header */}
        <header className="space-y-6">
          <CsseLogo size={28} />
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.22em] text-primary">Brand System</p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
              Competitive Strategy
              <br />
              Starts Everywhere.
            </h1>
            <p className="max-w-xl text-muted-foreground">
              The <BrandText /> identity is built for a product-led betting platform —
              modern, confident, and engineered to scale from a 16px favicon to a
              stadium-side billboard.
            </p>
          </div>
        </header>

        {/* Logo system */}
        <Section kicker="01 — Identity" title="Logo system">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-8 flex items-center justify-center min-h-[160px]">
              <CsseLogo size={32} />
            </Card>
            <Card className="p-8 flex items-center justify-center min-h-[160px] bg-foreground text-background">
              <CsseLogo size={32} inverse />
            </Card>
            <Card className="p-8 flex items-center justify-center gap-6">
              <CsseAppIcon size={72} />
              <div className="space-y-1">
                <p className="text-sm font-medium">App icon</p>
                <p className="text-xs text-muted-foreground">22% corner radius · #0B1220 surface</p>
              </div>
            </Card>
            <Card className="p-8 flex items-center justify-center gap-6">
              <div className="flex items-center gap-3">
                <CsseAppIcon size={32} />
                <CsseAppIcon size={20} />
                <CsseAppIcon size={16} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Favicon scaling</p>
                <p className="text-xs text-muted-foreground">Crisp at 16/20/32 px</p>
              </div>
            </Card>
          </div>
        </Section>

        {/* Mark anatomy */}
        <Section kicker="02 — Mark" title="Anatomy">
          <Card className="p-10">
            <div className="flex flex-col sm:flex-row items-center gap-10">
              <CsseMark className="h-32 w-32 text-foreground" title="CSSEBets mark" />
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>
                  <span className="text-foreground font-medium">C-wedge</span> — Competitive
                  Strategy Starts Everywhere.
                </li>
                <li>
                  <span className="text-foreground font-medium">Inner chevron</span> — prediction,
                  ascent, winning through skill.
                </li>
                <li>
                  <span className="text-foreground font-medium">Grid</span> — 32-unit, 3.25-unit
                  stroke, rounded joins.
                </li>
              </ul>
            </div>
          </Card>
        </Section>

        {/* Color palette */}
        <Section kicker="03 — Color" title="Palette">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PALETTE.map((c) => (
              <Card key={c.name} className="overflow-hidden">
                <div className="h-20 w-full" style={{ background: c.value }} />
                <div className="p-3 space-y-0.5">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.hex}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{c.token}</p>
                </div>
              </Card>
            ))}
          </div>
        </Section>

        {/* Typography */}
        <Section kicker="04 — Typography" title="Type stack">
          <Card className="p-8 space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Wordmark / Display
              </p>
              <p
                className="mt-2 text-5xl tracking-tight"
                style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, letterSpacing: "-0.02em" }}
              >
                Space Grotesk · 700
              </p>
            </div>
            <div className="border-t border-border pt-6">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Wordmark sample
              </p>
              <div className="mt-3 flex items-end gap-6 flex-wrap">
                <CsseWordmark size={36} />
                <CsseWordmark size={22} />
                <CsseWordmark size={14} />
              </div>
            </div>
            <div className="border-t border-border pt-6 text-sm text-muted-foreground space-y-1">
              <p>UI / Body — system sans (Inter, SF Pro, Segoe UI fallback)</p>
              <p>Numerics — tabular figures for odds, stakes, balances</p>
              <p>Letter-spacing — −0.02em on headings, +0.18em uppercase on kickers</p>
            </div>
          </Card>
        </Section>

        {/* Usage */}
        <Section kicker="05 — Usage" title="Guidelines">
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-5 space-y-2">
              <p className="text-sm font-medium text-primary">Do</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                <li>Pair the mark with the wordmark for primary surfaces.</li>
                <li>Use the mark alone in tight headers and favicons.</li>
                <li>Keep clear-space ≥ the height of the inner chevron.</li>
                <li>Render on the dark surface (#0B1220) wherever possible.</li>
              </ul>
            </Card>
            <Card className="p-5 space-y-2">
              <p className="text-sm font-medium text-destructive">Don't</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                <li>Recolor the green to neon or arcade hues.</li>
                <li>Add drop shadows, bevels, or excessive glow.</li>
                <li>Stretch, skew, or rotate the mark.</li>
                <li>Place the wordmark on a busy photographic background.</li>
              </ul>
            </Card>
          </div>
        </Section>

        <footer className="pt-8 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <CsseLogo size={14} />
          <span>© {new Date().getFullYear()} <BrandText /></span>
        </footer>
      </div>
    </div>
  );
}
