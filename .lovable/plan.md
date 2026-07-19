
## What's happening

On the F1 race page, the "Your prediction" sticky slip and its stake input live at the bottom of `F1RaceDetailsPage.tsx` — a ~920-line component that also owns the Recharts market-movement chart, the market grid, wallet query, and 30s/60s polling queries.

Every keystroke calls `setStake(...)`, which re-renders the whole page. Two things in the current structure cause iOS to dismiss the keyboard on that re-render:

1. **Unstable ancestor identity around the `<input>`.** The fixed slip is rendered inline inside a large conditional/JSX block that also contains the heavy Recharts tree. On each render, sibling arrays (`chartMarkets = currentMarkets.slice(0,6)`, `seriesMeta`, `splitData`) get new references, and Recharts' `ResponsiveContainer` re-measures. On mobile Safari, when the chart component mutates the DOM in the same commit as the input update, the input node can be effectively re-inserted, which drops focus and closes the keyboard.
2. **Background polling touches the same tree.** `useQuery(["f1-race", raceId], …, { refetchInterval: 30_000 })` and `useQuery(["f1-histories", …], { refetchInterval: 60_000 })` both replace `q.data` / `chartQ.data`. If a refetch lands mid-typing, `currentMarkets` becomes a new array, `selectedMarket = currentMarkets.find(...)` becomes a new object, and if the selected id isn't in the fresh payload for a tick, the `{selectedMarket && <slip/>}` conditional unmounts and remounts the input.

The stake input itself is written correctly (controlled, no `key` that changes per keystroke, no `autoFocus`), so the fix is structural, not a one-line tweak.

## Fix

Isolate the slip so a keystroke re-renders only the slip, not the chart/markets tree, and stop refetches from tearing the input down.

1. **Extract `F1BetSlip` into its own `React.memo` component** in `src/features/f1/pages/F1RaceDetailsPage.tsx` (or a sibling file). It owns `stake` state internally and receives stable props: `selectedMarket`, `selectedDriverName`, `raceName`, `sectionTitle`, `balance`, `onClear`, `onSubmit`, `isPending`. Because it holds its own state, `setStake` no longer re-renders the parent, so the chart/markets don't recompute per keystroke and the input node stays put.
2. **Stabilise the mount around the input.** Always render the slip container (fixed positioned, `pointer-events-none` + inner `pointer-events-auto`) and toggle visibility via a `data-open` attribute / CSS, instead of `{selectedMarket && <div>…</div>}`. This guarantees the `<input>` DOM node is never unmounted while the user is typing, even if `selectedMarket` briefly becomes null during a refetch.
3. **Preserve selection across refetches.** In the parent, keep `selectedMarket` sticky: when a refetch returns markets that don't include `selectedId`, keep the previous `selectedMarket` object in a `useRef` and pass that to the slip until a new selection is made. This prevents the slip from flashing empty on the 30s poll.
4. **Reduce chart re-renders unrelated to typing.** Memoize `chartMarkets`/`seriesMeta`/`splitData` on stable primitives (e.g. `chartIdsKey`) rather than array identities, and wrap the chart section in its own `React.memo`d `F1MarketChart` component. Not strictly required for the keyboard bug once step 1 lands, but removes the wasted work that made it easy to trigger.
5. **Verify.** Open `/f1/races/:raceId` on a mobile viewport, tap the stake input, type several digits, and confirm the keyboard stays up and the value updates. Repeat while a 30s poll fires (wait ~30s mid-typing) to confirm the slip and focus survive a refetch.

## Files touched

- `src/features/f1/pages/F1RaceDetailsPage.tsx` — extract `F1BetSlip` (and optionally `F1MarketChart`), switch the slip from conditional mount to always-mounted + hidden, add sticky-selection ref.

No schema, server function, or business-logic changes. UI/presentation only.
