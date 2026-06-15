## Onboarding & Tutorial System Plan

A complete first-time user onboarding system for CSSEBets — guided tours, contextual help, walkthroughs, a Help Center, and admin controls. Nothing added to the landing page.

---

### 1. Database (1 migration)

**`profiles` table — add columns:**
- `onboarding_completed_at timestamptz`
- `onboarding_skipped_at timestamptz`
- `tour_progress jsonb default '{}'` — per-tour completion map, e.g. `{ "dashboard": true, "first_bet": true }`
- `onboarding_enabled boolean default true` — admin can disable per user

**New table: `onboarding_events`** (analytics)
- `user_id`, `tour_key text`, `event text` (`started|completed|skipped|step_viewed`), `step_index int`, `metadata jsonb`, `created_at`
- RLS: users insert their own; admins read all.
- GRANTs for `authenticated` (insert/select own) + `service_role`.

**New table: `onboarding_settings`** (global toggle)
- single-row `id=1`, `enabled boolean`, `updated_by`, `updated_at`
- RLS: anyone authenticated reads; only admin/super_admin writes.

**RPCs:**
- `mark_tour_complete(p_tour_key text)` — updates `tour_progress` for `auth.uid()`.
- `mark_onboarding_complete()` / `mark_onboarding_skipped()`.
- `admin_reset_onboarding(p_user_id uuid)` — admin only, clears flags.
- `admin_set_onboarding_enabled(p_user_id uuid, p_enabled boolean)`.
- `get_onboarding_completion_stats()` — admin reporting (completion rates per tour).

---

### 2. Tour Engine (reusable)

`src/components/onboarding/TourProvider.tsx` — React context + Radix Portal overlay.
- Dim backdrop (SVG mask cutout around target element).
- Auto-scroll target into view, highlight with glow ring.
- Floating tooltip card: title, body, **Step X of Y**, Prev / Next / Skip.
- Keyboard: Esc=skip, ←/→ nav.
- Targets via `data-tour="key"` attributes on existing UI.
- Persists state through `useTourState` hook (calls server fns).

Files:
- `src/components/onboarding/TourProvider.tsx`
- `src/components/onboarding/TourOverlay.tsx`
- `src/components/onboarding/TourTooltip.tsx`
- `src/components/onboarding/tours.config.ts` — all tour definitions (steps per page).
- `src/components/onboarding/useTour.ts`
- `src/components/onboarding/HelpIcon.tsx` — small `?` icon w/ popover (what / why / common mistakes).
- `src/lib/onboarding.functions.ts` — server fns (mark complete, log event, admin actions, stats).

Mount `<TourProvider />` inside `_authenticated/route.tsx`.

---

### 3. Welcome Modal

`src/components/onboarding/WelcomeModal.tsx` — shown once on first authenticated load when `onboarding_completed_at` and `onboarding_skipped_at` are both null.
- Title "Welcome to CSSEBets", subtitle, **Start Tour** / **Skip For Now**.
- Start Tour → kicks off Dashboard tour, then auto-chains to next page tours.

---

### 4. Page Tours

Add `data-tour` attributes to existing components (no logic changes) on:
- Dashboard — wallet balance, recent activity, quick actions
- Wallet — balance, request points button, transaction history
- Point Requests (within Wallet) — pointbank field, reference ID, proof upload, submit
- Matches — match list, odds, bet button
- Betting modal — stake input, potential return, place bet
- My Predictions — pending, settled, details
- Payout — request payout, history, proof upload
- Support — create ticket, conversation, attachments

Each tour stored in `tours.config.ts` with `{ key, route, steps: [{ target, title, body }] }`.

---

### 5. First-Time Walkthroughs

- **First Bet** — intercepts the bet sheet the first time; 5-step mini guide (Select Match → Market → Stake → Review → Confirm). Flag stored in `tour_progress.first_bet`.
- **First Point Request** — opens automatically on first visit to Point Requests; 5 steps (Pay → Reference → Upload → Submit → Wait).

---

### 6. Help Center

New route: `src/routes/_authenticated/help.tsx` with sections:
- Getting Started, Wallet & Points, Betting Guide, Payout Guide, Support Guide, FAQ.

Links added to user menu, footer (authenticated shell), and Support page header. Each section has a "Restart this tour" button.

---

### 7. Admin Controls

New tab in `src/routes/management/` (existing admin area):
- `src/routes/management/onboarding.tsx` — global enable/disable toggle, per-user table (search, status badge, Reset / Enable / Disable actions), completion analytics (cards: started/completed/skipped, per-tour completion %, drop-off chart).

---

### 8. Analytics

`logOnboardingEvent` server fn writes to `onboarding_events`. Admin page reads aggregated stats via `get_onboarding_completion_stats` RPC.

---

### Files Summary

**Migrations:** 1 (`add_onboarding_system`)
**New routes:** `_authenticated/help.tsx`, `management/onboarding.tsx`
**New components:** ~8 under `src/components/onboarding/`
**New server fns:** `src/lib/onboarding.functions.ts`
**Edited:** `_authenticated/route.tsx` (mount provider + welcome modal), and minor `data-tour=""` additions on Dashboard / Wallet / Matches / Bets / MyPredictions / Payout / Support (no behavior change).

---

### Out of scope
- No landing page changes.
- No changes to betting/wallet/payout/admin business logic — only DOM attributes for targeting.

Ready to build on approval.