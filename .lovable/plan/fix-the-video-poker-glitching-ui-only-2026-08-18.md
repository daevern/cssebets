# Fix the Video Poker glitching (UI only)

Video Poker looks unstable because three separate animation systems fight over the same cards on every draw, and the board itself changes height mid-reveal, which makes the whole table rescale and jump. Nothing about payouts, odds, fairness or the server logic changes — this is a presentation-layer fix.

## What is actually going wrong

1. **Two animations on one card.** `PlayingCard` already runs its own deal-slide and face-flip (it moves the card in from off-screen, then turns it over on a timer). On the draw, `PokerBoard` wraps that same card in a second CSS animation (`pokerDrawFlip`) that rotates and scales it at the same time. Two transforms on nested elements, started on separate timers, produce the double-flip / stutter / cards briefly landing in the wrong place.

2. **A leftover transform after the flip.** The wrapper's animation is set to keep its final frame while a second glow animation is not, so once the sequence finishes the card can be left holding a stale transform. That is the "card sits slightly off / snaps" effect.

3. **The board grows mid-reveal.** When the hand settles, a new "Dealt" summary row appears above the cards. `ArcadeStage` measures the board and uniformly scales it to fit the space between the stats bar and the control dock, so the moment that row mounts the entire table visibly rescales — while the cards are still animating. The resize observer then re-measures during the animation, which is the zoom-wobble.

4. **Cards fly in from a guessed position.** `PlayingCard` is given no shoe/deck reference in poker, so it falls back to "start 35% of the window width away". Under the stage's scale transform that offset is wrong, so cards enter from an arbitrary spot at an arbitrary speed depending on viewport size.

5. **Replaced cards remount.** The card wrapper's React key includes the card value, so drawn cards unmount and remount and re-run the full entry animation on top of the draw animation, while held cards do not — the row animates unevenly.

## The fix

- **One animation owner per card.** Keep `PlayingCard` responsible for movement and the flip; remove the competing `pokerDrawFlip` / scale wrapper animation. Replaced cards get a short face-down-then-flip via the existing card timings, so the draw still reads clearly but only one transform is ever active.
- **Keep the highlight, drop the transform.** The "new card" attention cue becomes a non-transform effect (border/glow only), so nothing can be left mid-transform when it ends.
- **Reserve the layout.** Give the "Dealt" summary row a fixed reserved height that exists from the start of the round (invisible until settle), and give the card row a fixed height, so the board's measured height never changes during a hand and the stage stops rescaling mid-reveal.
- **Stabilise the stage for poker.** Pin the poker board to a single computed scale for the duration of a round instead of re-measuring while cards move.
- **Stable keys.** Key each card slot by its index and round only, so held and replaced cards behave identically and no card remounts mid-draw.
- **Deterministic entry.** Give the poker cards a defined origin point (a small deck marker on the felt) rather than the viewport-width fallback, so the deal looks the same on phone and desktop.

## Files touched

- `src/components/arcade/PokerBoard.tsx` — remove the duplicate flip wrapper, stable keys, reserved-height rows, non-transform highlight, deck origin ref.
- `src/components/arcade/PlayingCard.tsx` — allow a supplied origin and avoid the viewport-width fallback when one is given (guarded so Blackjack keeps its current behaviour).
- `src/routes/_authenticated/arcade/poker` route — reveal timing constant adjusted to match the single animation, if the new timings are shorter.
- `src/styles.css` — retire the unused poker flip keyframes, keep a transform-free highlight.

## Verification

Run the poker table headlessly at mobile and desktop widths, screenshot each phase (idle, dealt, holds, drawing, settled) and confirm the board's measured height and stage scale stay constant across the whole round.
