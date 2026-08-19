# Fix: sign-in rejects internal accounts like daev@armin.local

## What's happening

The sign-in page runs the same strict signup-grade email check as account creation. That check blocks addresses ending in `.local`, `.test`, `.invalid`, `.example`, `.localhost` because those are meant to stop people *registering* fake inboxes. Your staff/internal account `daev@armin.local` ends in `.local`, so the login form refuses it before it ever reaches the auth server — hence "Please use a real, working email address".

The same rule would also block the simulation accounts (`simuser001@test.local`) and any other internal address.

## The fix

Split validation into two levels:

- **Sign-up (`/register`)** — keeps the strict rule. Disposable and non-routable domains stay blocked, so nobody can create throwaway accounts.
- **Sign-in (`/auth`)** — only checks that the address is well-formed. Whether the account exists is already decided by the auth server, so blocking existing accounts by domain adds no security, only lockouts.

Result: `daev@armin.local` signs in normally, genuinely malformed input still gets a clear message, and registration protection is unchanged.

## Technical detail

- `src/lib/email-validation.ts`: add a `validateLoginEmail(input)` export that runs format/length checks only (no disposable list, no blocked-suffix list). Keep `validateRealEmail` as-is for signup.
- `src/routes/auth.tsx`: swap `validateRealEmail` for `validateLoginEmail` in the email branch of `onSubmit`.
- `src/routes/register.tsx`: unchanged.
- Note: the staff portal at `/management/login` never had this check, which is why the same account works there.
