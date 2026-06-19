# Trust & Transparency Upgrade

Adds honest, database-backed trust signals to CSSEBets. **No fake stats, no synthetic activity, no placeholder numbers.** When data is thin, surfaces show honest "building" messaging instead.

All new UI uses the existing dark / neon stencil design system (`PageShell`, `StencilPanel`, custom SVG icons in the `TacticalPitch` / `SubsBench` style).

---

## 1. Real-data server functions (one new file)

Create `src/lib/trust.functions.ts` exposing read-only, **public** server fns that aggregate anonymized stats from existing tables. Each uses the server publishable client (no auth needed for aggregates) and projects only safe columns. Numbers come from real `COUNT` / `AVG` queries; usernames are masked server-side before leaving the DB layer.

- `getPlatformPulse` → registered members, active members (30d), bets placed, settled bets, approved payouts, total points paid out, avg payout processing time, avg point-request approval time, `updatedAt`. Each field returns `null` when the underlying count is 0 so the UI can show "Collecting platform statistics".
- `getRecentActivity` → last 20 events from `predictions` (placed/won), `payout_requests` (requested/paid), `point_requests` (approved). Username masked to `Da***n` style (first 2 + last 1 of display_name, or `User #<short-id>` fallback). Strips amounts above a safe cap; never returns emails / phone / full names.
- `getPayoutPerformance` → avg processing time, total completed, largest completed, success rate. Returns `{ hasHistory: false }` when fewer than ~3 completed payouts.
- `getCommunityGrowth` → members joined this month, bets this month, payouts completed this month. Returns raw integers (including 0).
- `getPlatformStatus` → reads `health_check_runs` + `operational_alerts` + `incidents` to derive `operational | degraded | offline` per service (Fixtures API, Odds Feed, Bet Settlement, Wallet, Payouts, Support). Falls back to `operational` only when a recent successful check exists; otherwise `unknown` (shown as "No recent check").
- `getSupportStats` → open / in-review / awaiting-user / resolved counts + avg first-response time from `support_conversations` + `support_messages`.

A migration adds the few narrow `TO anon` SELECT policies + GRANTs needed so these aggregates work without leaking row data. Policies project at the SQL-function level using `SECURITY DEFINER` aggregate functions (e.g. `public.pulse_counts()`) so anon never gets direct row SELECT on sensitive tables — only the aggregate output.

## 2. Authenticated server fns for personal trackers

- `getMyPointRequestTimeline(requestId)` → returns status history (`submitted → under_review → approved → credited`) with timestamps + admin note, derived from existing `point_requests` columns. Uses `requireSupabaseAuth`.
- `getMyBadges()` → derives badges from real activity counts (Verified Member, First Bet, 10 Bets, 100 Bets, Winning Streak ≥3, Payout Completed). Pure read, no new table.

## 3. New routes & components

```text
src/routes/_authenticated/
  trust-center.tsx        # Trust Center (commitments, points, settlement, payout, responsible play)
  status.tsx              # Platform Status
  changelog.tsx           # Public changelog (markdown-driven)
src/routes/
  (none — Trust Center & Status are auth-gated to keep parity with rest of app)
src/components/trust/
  PlatformPulse.tsx       # Dashboard section
  ActivityFeed.tsx        # Dashboard section
  PayoutPerformance.tsx   # Reused on Payout page + Trust Center
  CommunityGrowth.tsx     # Dashboard section
  FounderNote.tsx         # "Building for the Long Run" homepage block
  PointRequestTimeline.tsx# Used inside Wallet point-request detail
  BadgeGrid.tsx           # Settings / profile area
  StatusGrid.tsx          # Status page
  SupportStats.tsx        # Support page header
  TrustIcons.tsx          # Custom SVG icons (shield, pulse, timeline, badge) in stencil style
src/content/
  changelog.ts            # Hand-curated entries { date, type: 'feature'|'fix'|'improvement', title, body }
```

## 4. Page edits

- `dashboard.tsx` — insert `PlatformPulse`, `ActivityFeed`, `CommunityGrowth`, `FounderNote` panels below existing hero/bench block. Each panel handles its own loading + empty state.
- `wallet.tsx` — add `PointRequestTimeline` to each point-request row (expandable).
- `payout.tsx` — add `PayoutPerformance` panel above existing payout form. Add line: "Every payout request is manually reviewed for account security."
- `support.tsx` — add `SupportStats` strip at top + per-conversation status pill.
- `settings.tsx` — add `BadgeGrid` section.
- `route.tsx` (auth layout nav) — add nav entries: Trust Center, Status, Changelog (with new stencil icons). Mobile nav gets the same.

## 5. Honest empty states (everywhere)

Each panel renders one of:
- Real numbers, with "Updated live · <relative time>".
- `EmptyState` component with copy like "Collecting platform statistics", "Building payout history", "Every community starts somewhere. Thank you for helping build CSSEBets."

No skeleton-as-fake-data, no animated counters spinning to random numbers.

## 6. Privacy & safety guarantees

- Activity feed masks names in the SQL function — raw names never cross the wire.
- No emails, phones, addresses, full amounts above a cap, or admin notes leak via public fns.
- Trust Center copy is static, app-owner attributed, no certification claims, no "verified by Lovable" language, no compliance promises.
- Status page reflects real `health_check_runs`; no fabricated uptime %.

## 7. Changelog

Hand-curated TS array (no DB) rendered as a clean timeline. Entries grouped by month, typed (feature / fix / improvement) with neon stencil chips. Adding entries = editing one file; honest and easy to maintain.

---

## Technical notes

- All aggregate server fns are public (no `requireSupabaseAuth`) so the dashboard SSR/prerender works without a bearer token.
- New SQL functions are `SECURITY DEFINER` + `SET search_path = public` and `GRANT EXECUTE ... TO anon, authenticated`.
- No new tables — everything derives from existing schema (`profiles`, `predictions`, `payout_requests`, `point_requests`, `support_*`, `health_check_runs`, `operational_alerts`, `incidents`).
- TanStack Query: each component uses `queryOptions` + `useQuery` with 30–60s `staleTime`; "Updated live" timestamp comes from `dataUpdatedAt`.
- All new icons are inline SVGs matching the existing stroke-1.6 neon stencil style.

## Out of scope (this pass)

- No new admin tooling for changelog (file-based is intentional for credibility + speed).
- No new badges table — derived on the fly.
- No realtime websockets for activity feed — polling every 30s is honest enough and cheap.

## Files

**Migration (1):** add SECURITY DEFINER aggregate functions + GRANTs for anon stats.

**Created (~14):** `src/lib/trust.functions.ts`, 3 route files, 10 components, `src/content/changelog.ts`.

**Edited (~6):** `dashboard.tsx`, `wallet.tsx`, `payout.tsx`, `support.tsx`, `settings.tsx`, `_authenticated/route.tsx`.
