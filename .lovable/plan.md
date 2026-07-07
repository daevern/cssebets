Update the home page Upcoming Fixtures card accent so the active state no longer uses a full neon border.

What to build:
1. Add a new CSS utility in `src/styles.css` (e.g. `.fixture-active-corner`) that places a soft, dim neon accent on the top-left corner of a card. The accent should use a conic gradient that starts opaque at the corner and fades to transparent, giving a "thick to light" blend into the card surface, plus a subtle neon glow.
2. In `src/routes/index.tsx`, replace the active fixture card's `border-[var(--neon)]/60` class with the new `.fixture-active-corner` class, while keeping the existing rose live-state border and default hover border unchanged.
3. Verify the accent renders correctly on mobile-first viewports and does not overlap or clip the card content.

What will not change:
- Live match cards keep the rose border.
- Inactive cards keep the default hover border.
- Layout, spacing, sizing, and data logic stay the same.