## Scope

Frontend-only UI/UX redesign of CSSEBets to match the approved Kalshi-inspired premium football prediction market concept (reference images IMG_0982/0984/0985/0986). No backend, RPC, schema, wallet, settlement, admin, odds, or business-logic changes.

## Design system updates

**`src/styles.css`** — refresh tokens for the new premium dark-green language:
- `--color-surface` extremely dark green/near-black, `--color-surface-2` slightly elevated
- `--color-neon` retained as brand green but used sparingly (primary CTA, active tab, selected, live, gain)
- Remove global scanline overlay usage in redesigned pages
- Softer border tokens, larger radius scale, refined text-secondary
- Utility for `.safe-bottom` padding: `calc(120px + env(safe-area-inset-bottom))`

**`src/components/ui/page-shell.tsx`** — new lightweight `PremiumShell` (or refactor existing) with:
- clean top bar (logo + points pill + bell + profile)
- no dashed footers on user routes
- content area with safe-bottom padding
- optional `title`/`subtitle` slot

**Bottom nav** — new `src/components/nav/BottomNav.tsx`:
- Home / Markets / Activity / Portfolio / Search
- routes mapped: `/dashboard` → Home, `/matches` → Markets, `/my-predictions` → Activity, `/wallet` → Portfolio, `/support` → Search
- rendered inside `_authenticated/route.tsx` (replacing current nav)
- active state uses green accent; respects safe-area

## Pages redesigned

1. **Home (`_authenticated/dashboard.tsx`)** — Matchday hero
   - Header "Matchday" + "FIFA World Cup 2026" + "See all fixtures"
   - Featured match hero card (live/next fixture) w/ flags, score, 1X2 probability strip, big **Open Market →**
   - "Live & Trending" horizontal scroll of small flag cards
   - "Featured" shortcut tiles (World Cup 2026 / Popular / Upcoming / Specials)
   - Removes bench slider clutter, keeps existing data sources (`listMatchesForUsers`, trust queries)

2. **Markets (`_authenticated/matches.index.tsx`)** — fixture discovery
   - Title "Matches" + subtitle
   - Live/Today/Upcoming pill filter with counts
   - Premium match cards (flags, teams stacked, two estimates with %, `Open Market →`) — no market grids
   - Whole card tappable → market detail

3. **Analytics (`_authenticated/matches.$matchId.tsx`)** — event market page
   - Cleaner header (back / logo / points)
   - Event context line + scoreboard with enlarged flags, score, last play
   - Trust line (subtle)
   - Keep `MarketAnalyticsCard` graph (data untouched, restyle container)
   - "Top markets" preview (Full Time / Qualify / O-U 2.5 / BTTS) → tap to open prediction sheet
   - Removes full market grid tabs (moved to prediction screen)

4. **Prediction screen** — new `src/components/matches/PredictionSheet.tsx` (bottom sheet / dedicated view from market card tap)
   - Question heading, Yes/No or 1X2 outcome tiles w/ multiplier + est. chance
   - Trade-ticket panel: selected outcome, multiplier, points input + MAX, available, return, gain
   - CTA `Lock Prediction`, footer note
   - Balance-aware disable states + copy ("Add Points to Lock" / "Points exceed balance")
   - Reuses existing `place_bet_atomic` server fn

5. **Activity (`_authenticated/my-predictions.tsx`)**
   - Rename UI text to Active/Correct/Incorrect/Voided/Returned
   - Cleaner card grouping, less bookmaker chrome
   - Uses existing queries

6. **Portfolio (`_authenticated/wallet.tsx`)**
   - "Points Wallet" — balance, pending returns, recent movements categorized (Prediction locked / return / Points added / Cashout / Adjustment / Reversal — mapped from existing `transaction_category`)
   - No logic change

7. **Search/Support (`_authenticated/support.tsx`)** — light refresh only, FAQ + help links.

## Copy replacements (display-only)

Global text swap in redesigned components: Bet→Prediction/Lock Prediction, Odds→Multiplier, Stake→Points, Payout→Return, Profit→Gain, Wager→Points where natural. Backend field names untouched.

## Files touched (approx.)

- `src/styles.css`
- `src/components/ui/page-shell.tsx` (or new `PremiumShell.tsx`)
- `src/components/nav/BottomNav.tsx` (new)
- `src/routes/_authenticated/route.tsx`
- `src/routes/_authenticated/dashboard.tsx`
- `src/routes/_authenticated/matches.index.tsx`
- `src/routes/_authenticated/matches.$matchId.tsx`
- `src/routes/_authenticated/my-predictions.tsx`
- `src/routes/_authenticated/wallet.tsx`
- `src/routes/_authenticated/support.tsx`
- `src/components/matches/MarketTabs.tsx` (restyle prediction ticket to trade-ticket)
- `src/components/matches/MarketAnalyticsCard.tsx` (container restyle only)
- New: `src/components/home/FeaturedMatchHero.tsx`, `LiveTrendingStrip.tsx`, `FeaturedShortcuts.tsx`
- New: `src/components/matches/MatchDiscoveryCard.tsx`

## Explicit non-changes

- No migrations, no edits to `*.functions.ts` handlers, no changes to `place_bet_atomic`, settlement, wallet RPCs, admin routes, risk dashboard, correlated exposure, audit logs, maker-checker, odds generation.
- `src/routes/management/**` untouched.
- Auth/landing routes untouched (previously redesigned).

## Verification

- Typecheck via harness
- Manual smoke: Home loads → featured hero visible → Open Market → analytics → select outcome → enter points → Lock Prediction; 0-balance disables CTA; Activity + Portfolio render.

## Known trade-offs

- Given scope, some legacy trust panels (PlatformPulse, BadgeGrid) will be de-emphasized on Home to keep the "one clear action" rule; they remain accessible via Trust Center route.
- Rollout in single pass; if any page renders empty due to missing real data, a clean empty state replaces mock content (no fake demo data).
