## Problem

In `src/components/matches/MarketTabs.tsx`, the `StakeSlip` stake field uses `<input type="number" min={10} max={...}>`. On mobile (mainly Android Chrome), deleting the last digit or typing after an empty value causes the on-screen keyboard to hide and reappear. This is a bug, not intentional.

Root causes:
1. `type="number"` + `min` — emptying the field makes it "invalid", browser dismisses the numeric IME; refocus on next tap reopens it.
2. `sticky` positioning on the slip — soft keyboard resize shifts the sticky element, which can steal focus on some Android builds.

## Fix (frontend only, `src/components/matches/MarketTabs.tsx`)

Scoped to the `StakeSlip` input at ~lines 284–294. No other files, no backend changes.

1. **Swap input type to text with numeric IME.**
   - `type="text"` (was `type="number"`)
   - Keep `inputMode="numeric"` and add `pattern="[0-9]*"` (iOS numeric keypad)
   - Add `autoComplete="off"`
   - Remove HTML `min` / `max` attributes (JS `stakeError()` already validates)

2. **Sanitize onChange to digits only** so pasting/typing non-numerics doesn't sneak through now that `type="number"` is gone:
   - `onChange={(e) => setStake(e.target.value.replace(/\D/g, ""))}`
   - Allow the value to be an empty string while editing (don't coerce to "0"); existing `Number(stake) || 0` logic and `stakeError` already handle empty gracefully — the Place-Bet button stays disabled until value ≥ MIN_STAKE.

3. **No visual/style changes.** Class names, layout, sticky behavior, submit button, return/gain display all stay as-is.

## Why this fixes it

Removing `type="number"` eliminates the browser's built-in numeric-validity check that was dismissing the IME on empty/invalid state. `inputMode="numeric"` + `pattern="[0-9]*"` keeps the same numeric keypad on iOS and Android without the dismissal behavior. Sticky layout stays but is no longer the trigger — the keyboard stops closing on delete/retype, so the sticky reflow issue becomes invisible in practice.

## Out of scope

- No change to validation rules, min/max stake, server functions, or the submit flow.
- Not touching `sticky` positioning (not needed once #1 is fixed).
- Not touching the Correct Score stake slips separately — they reuse the same `StakeSlip` component, so they're fixed automatically.

## Verification

- On a mobile viewport (or real Android device): open `/matches/:matchId` → pick a selection → focus stake → delete "10" → keyboard stays up → type digits → keyboard stays up.
- Desktop: input still accepts only digits; Place Bet still disables below min stake and above balance.
