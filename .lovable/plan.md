# Comment notifications + real profile pictures + Kalshi-style profile

Two features: (1) notify people when their comment gets a reply or a like, (2) let users upload and edit a profile picture that shows everywhere they comment, with the profile page restyled to look like Kalshi.

## 1. Reply and like notifications

What the user sees:
- Someone replies to your comment → notification "Alex replied to your comment" with a snippet, tapping it opens the match thread and scrolls to that reply.
- Someone likes your comment → notification "Alex liked your comment". Likes are grouped so 8 likes on one comment show as one entry ("Alex and 7 others liked your comment"), not 8.
- Appears in the existing bell / notifications page alongside bets and payouts, and counts toward the unread dot.
- You never get notified about your own reply or your own like.
- A web push is sent for replies only (likes stay in-app) so phones don't buzz constantly; respects existing notification preferences.

How it works:
- New server function `listSocialNotifications` reads, for the signed-in user: replies whose parent comment belongs to them, and likes on their comments, from the last 30 days.
- These are merged into `useNotifications` as two new kinds (`comment_reply`, `comment_like`) in a new `social` category, reusing the existing localStorage "last read" unread logic.
- Deep link format `/<event route>?comment=<id>`; `CommentThread` highlights and scrolls to that comment on mount.
- Push for replies is dispatched from the existing notification service after the comment insert succeeds, added as a new event type, and skipped when the parent author is the same user.
- No new tables; everything derives from `event_comments` and `event_comment_likes`.

## 2. Profile pictures

- `profiles.avatar_url` already exists — no schema change needed for the column.
- Create a public `avatars` storage bucket with policies: anyone can read, a user can upload/replace/delete only files under their own user id folder.
- Upload flow in the profile page: pick an image → in-browser editor (drag to reposition, pinch/scroll to zoom, circular crop) → exported as a square 512px JPEG (client-side canvas, ~100 KB) → uploaded to `avatars/<user id>/avatar.jpg` → `profiles.avatar_url` updated with a cache-busted URL. Remove-photo option falls back to the initial-in-circle badge.
- Validation: images only, max 8 MB before crop.
- Avatars render in: comment threads (main + replies), the comment composer, the top bar / hamburger account row, and the admin comment moderation list. Everywhere falls back to the current green initial circle when no photo is set.
- `listCommentsForEvent`, `getMyCommentStatus`, and the admin comment list start returning `avatarUrl` along with the display name.

## 3. Kalshi-style profile page

Restyle the existing `/settings` page (kept at the same route so all current links work) into a profile page in Kalshi's visual language, on top of the existing CSSEBets tokens (no hardcoded colors):

```text
┌───────────────────────────────────────┐
│  ●  Display name            [Edit]    │   avatar 72px, name, member since
│     @reference · joined Aug 2026      │
├───────────────────────────────────────┤
│  Balance   Bets   Win rate   Rank     │   thin stat strip
├───────────────────────────────────────┤
│  Account                              │   flat rows, label left / value right
│  Email            you@mail.com    >   │   chevron opens inline editor
│  Phone            +60...          >   │
│  Password         Change          >   │
├───────────────────────────────────────┤
│  Preferences  (notifications toggles) │
├───────────────────────────────────────┤
│  Referrals · Badges · Sign out        │
└───────────────────────────────────────┘
```

- Clean flat list rows with hairline dividers instead of stencil panels, generous whitespace, small uppercase section labels, values right-aligned, edit revealed inline on tap rather than always-open forms.
- Mobile-first: full-bleed rows, 44px tap targets, avatar editor as a bottom sheet.
- Existing blocks (referrals, badges, notification settings, sign out) are reused, just re-skinned into the new row/section system.

## Technical notes

- Storage bucket created via the storage tool; RLS policies on `storage.objects` via migration.
- Avatar upload happens directly from the browser with the user's session (RLS-scoped), no server function needed; `profiles` update goes through the existing client with the owner policy.
- Notification reads use a `requireSupabaseAuth` server function; nothing new is exposed publicly.
- Like notifications are aggregated in the server function by comment id to avoid list spam.
