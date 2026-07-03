
## Problem

On mobile (393px), the TopBar in `src/components/nav/TopBar.tsx` packs too many items into one row: brand logo + text, wallet chip (`PTS` label + number), TokenChip, Notifications button, Profile button. Combined widths exceed the viewport, causing horizontal overflow and a "side slide" (page scrolls sideways).

## Fix

Scope: `src/components/nav/TopBar.tsx` only (presentational).

1. **Prevent overflow at the container level**
   - Add `min-w-0` to the inner flex row and `overflow-hidden` on the header so nothing can push the page wider than the viewport.
   - Ensure `max-w-md` row uses `w-full` + `min-w-0`.

2. **Slim the right-side cluster on mobile**
   - Wallet chip: drop the `PTS` suffix on mobile (show only icon + number); reveal `PTS` at `sm:`. Reduce horizontal padding (`px-2.5`) and gap.
   - TokenChip: keep, but ensure it uses `shrink-0`.
   - Notifications + Profile buttons: shrink from `h-9 w-9` to `h-8 w-8` on mobile, promote to `h-9 w-9` at `sm:`. Add `shrink-0`.
   - Reduce the right cluster `gap-2` to `gap-1.5` on mobile.

3. **Left side (brand)**
   - Wrap brand in `min-w-0` and add `truncate` to the brand text so it can shrink instead of forcing width.
   - Keep the current `hidden xs:inline` behavior for the wordmark.

4. **No functional/behavior changes** — same links, same balance display logic, same admin/pending badges elsewhere untouched.

## Acceptance

- At 393px width, TopBar fits with no horizontal page scroll.
- All existing items remain reachable (wallet, tokens, notifications, profile).
- Desktop (`sm:` and up) visual is unchanged or nearly so.
