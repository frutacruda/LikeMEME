# Supabase Multiplayer POC

## Prerequisites

- A Supabase project with **Anonymous Sign-Ins enabled**: Authentication → Sign In / Providers → Anonymous.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
- Supabase CLI for the recommended migration workflow.

## Apply the schema

The reproducible migration is `supabase/migrations/20260917000000_followme_multiplayer_poc.sql`.

Recommended CLI workflow:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

For a one-off POC, the complete migration can instead be pasted once into the Supabase SQL Editor and run as one script. Do not create tables or policies manually.

## Local test

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in two separate browser profiles (or one normal and one incognito window). Create a room, enter a nickname, open the invite URL in the other profile, and enter a different nickname. Anonymous Auth identities must differ, which is why simply opening two tabs in one profile is not a valid two-device simulation.

## Vercel

In Project Settings → Environment Variables, add both variables for Preview and Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use the values from Supabase Project Settings → API. These are public client configuration values, not the secret/service-role key. Redeploy after changing them because `NEXT_PUBLIC_` values are embedded at build time.

## Real-device test

1. Deploy the branch to Vercel and open the same HTTPS deployment URL in Mac Chrome and iPhone Safari.
2. On Mac, create a room and enter nickname `Mac`.
3. Share the invite URL to iPhone (or enter the six-digit code), then enter nickname `iPhone`.
4. Confirm both devices show the same two players without refreshing. Only Mac should show Start.
5. Tap Start on Mac. Confirm both devices show `Game started` / `ROUND 1` without refreshing.
6. Refresh either device and confirm it returns to the same current state.

## Design notes and limits

- Postgres is authoritative; Realtime events only trigger a fresh `get_room_snapshot` RPC.
- Focus/online recovery and a post-subscribe refresh cover missed events. Supabase Auth persists the anonymous session for refresh/reconnect.
- Room creation, join, and start are `SECURITY DEFINER` RPCs with a fixed empty `search_path`; table writes are not granted to clients.
- Joining locks the room row, then checks status, nickname uniqueness, and the first of four unique seats. The database unique indexes remain the final concurrency guard.
- Starting locks the room row and verifies host identity, membership, waiting status, and a current count of at least two.
- Players intentionally remain in the room across transient disconnects. Presence, explicit leave, host migration, expiry cleanup, and reconnect grace handling are outside this validation. Abandoned waiting rooms therefore need a later scheduled cleanup policy.
- Room codes have one million possibilities and collision retries, but are not credentials. RLS protects snapshots and rows from non-members.
- Anonymous Auth must be enabled and projects should configure CAPTCHA/rate limits before public launch to limit room spam.
