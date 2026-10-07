# TIIN: iOS Google login and session persistence

## Root cause

The installed iOS PWA and the Safari authentication window can have separate
localStorage. A successful Safari login does not authenticate the installed PWA.
`persistSession: true` alone cannot bridge those storage containers.

## Implemented flow

1. TIIN creates a short-lived challenge and stores a random claim secret locally.
2. Supabase PKCE stores its code verifier in the initiating TIIN instance.
3. Google/email return to the production origin with a PKCE authorization code.
4. A separate Safari callback relays only the code, without creating a Safari session.
5. When the installed app resumes (visibility/pageshow/focus or restart), it retrieves
   the code using the device secret and exchanges it using its original verifier.
6. Supabase persists and refreshes the resulting session in TIIN localStorage.
7. The relay record is acknowledged/deleted. Incomplete records expire after 10 min.

No tokens, passwords or financial documents are stored in the relay. Frontend roles
have no table privileges and no RLS policies on the service-only relay table.
The Edge Function disables gateway JWT verification because users are not yet
signed in; it instead uses unpredictable challenge capabilities, hashed device
claim secrets, expiration, one-write completion and restricted origin.

The `auth_pkce_handoffs` table is separate from the old unused `auth_handoffs`.
Do not delete or migrate customer finance data when applying its SQL.

## Data preservation and sync

- Migration remains explicit; requires a local backup and server readback.
- Account migration markers and synchronization baselines are user-scoped.
- Empty cloud data cannot replace local financial history.
- Downloaded records do not enter the upload queue.
- In-flight local edits remain queued; optimistic version checks prevent blind overwrites.
- Array edits/deletes/additions are applied by ID relative to each device's baseline.
- Resume/online/30-second checks download cloud changes; balance anchors sync as data.
- All Supabase API calls are deferred outside auth-state callback locks.
- Google and email both use the same safe return flow. Email provider sending limits
  remain configured server limits, not an application login fix.

## Checks

Run `node tests/auth-sync.test.cjs` for regression scenarios.
Run `node tests/live-auth-relay.cjs` for deployed relay security/lifecycle and OAuth initiation.
The latter creates only a disposable fake authorization-code challenge, then deletes it.

Physical iPhone acceptance (requires user Google approval):
1. Start Google sign-in in installed TIIN, select the account.
2. Safari shows "Вход подтверждён". Close its window with × / return via app switcher.
3. TIIN shows the account avatar and, if needed, the explicit local migration screen.
4. Confirm migration once, check count/balance/history on the phone and laptop.
5. Force-close/reopen TIIN; verify the avatar and data remain, then add/edit/delete
   a test entry and verify it on the other device (remove it afterward).

Do not claim physical iOS or real-user Google-login verification from Node tests.
