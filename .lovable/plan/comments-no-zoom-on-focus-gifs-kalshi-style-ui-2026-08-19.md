# Comments: no zoom on focus, GIFs, Kalshi-style UI

Three changes to the comment section, all in the comment components plus one small server addition for GIF search.

## 1. Stop the zoom when tapping the composer

On iOS Safari, tapping a text field whose font size is under 16px makes the browser zoom the whole page in. The composer and reply box currently use 14px text, which is exactly what triggers it. Both get 16px text so focusing a comment box never zooms, and the composer grows in height as you type instead of scrolling inside a fixed box.

## 2. GIF picker (Tenor)

- A GIF button in the composer opens a picker sheet: trending GIFs on open, a search field, and an infinite grid of results.
- Picking a GIF attaches it as a preview above the composer; posting sends the comment with the GIF. A comment can be a GIF only, or a GIF plus a short caption.
- GIFs render inline in the thread at a capped size, rounded, with a small "GIF" tag in the corner, and load lazily.
- Replies can include GIFs too, using the same picker.
- Only Tenor-hosted URLs are accepted server-side, so the field can't be used to inject arbitrary images.
- No device uploads — GIF search only, as agreed.
- Needs a free Tenor API key (Google Cloud). I'll ask for it as a secret when implementing; searches go through the server so the key stays private, and results are briefly cached to stay inside the free quota.

## 3. Kalshi-style comment UI

Rework the thread's look to match Kalshi's:

- Flat rows separated by hairline dividers instead of bordered cards — no boxes around each comment.
- Circular avatar with the user's initial on the left, name + position badge + relative time on one compact line, body beneath.
- Position badge restyled as Kalshi's small pill next to the name.
- Actions become a light row of icon + count: like, reply, and an overflow (…) menu holding delete, instead of three inline text buttons.
- Replies indent under the parent behind a thin left rail, with a "Show N replies" toggle rather than always-expanded.
- Sort control at the top ("Top" / "Newest"), comment count next to the heading.
- Composer sits directly under the heading as a single-line field that expands on focus and reveals the GIF button, Post button, and character counter.
- Guests keep the full thread plus the "Sign in to comment" prompt in the composer's place.
- Mobile-first throughout: full-width rows, 44px tap targets, GIF picker as a bottom sheet with safe-area padding.

## Technical notes

- Migration: add a nullable `media_url` (and `media_provider`) column to `event_comments`; `body` becomes optional when media is present. Existing RLS/GRANTs unchanged.
- `src/lib/comments.functions.ts`: `postEventComment` accepts optional `mediaUrl`, validated against a Tenor host allowlist; `comments.server.ts` returns it on each node.
- New `searchGifs` server function (Tenor featured + search, keyed by the secret, rate-limited per user).
- New `src/components/social/GifPicker.tsx`; `CommentThread.tsx` restyled and split so `CommentItem` handles the new row layout.
- Composer/reply inputs set to `text-base` (16px) to prevent iOS focus zoom; no viewport meta change.
