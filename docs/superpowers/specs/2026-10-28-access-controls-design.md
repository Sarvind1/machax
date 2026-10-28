# access controls: login, usage credit, recharge

date: 2026-10-28 · branch: `access-controls` (worktree `~/Projects/machax-access`, off `origin/main`)

## intent

Early access is open to the internet with no login and no server-side cap. Anyone who finds `/api/chat` can burn the $200 token budget. We want every message tied to a real account, every account capped at $1 of model spend for free, and a ₹219 recharge that adds $2 more.

## goals

- nobody can call the model without a verified login
- each account gets $1.00 of free model spend, once, for life
- spend is metered from real token usage on every model call, not estimated
- when the credit is gone the user sees a clear recharge prompt, and the server refuses the call even if the UI is bypassed
- ₹219 recharge adds $2.00 of credit: Google Play Billing inside the Android app, Razorpay on the web
- the balance is shown as "about N messages left", never as dollars

## non-goals

- subscriptions, multiple plans, promo codes
- refunds UI (manual via dashboards)
- migrating Convex client mutations to Firebase-verified auth (see hardening follow-ups)
- iOS

## anti-goals

- a cap that only lives in the browser (the current demo cap is localStorage and trivially bypassed)
- a Razorpay checkout inside the Android app (Play policy violation, risks listing rejection)
- trusting the client for any amount, balance, or price

## current state (from recon)

- Login is username + password in Convex (`convex/users.ts`); after login the client only stores `localStorage["machax-user"]`. No session token exists. `/api/chat` receives a display name and checks nothing else.
- Anonymous demo mode: 2 free messages counted in localStorage, enforced only client-side.
- All model calls go through `callModel` in `src/lib/orchestrator.ts`. One user message triggers up to ~10 Sonnet 5.5 calls plus Haiku 4.5 helpers. Token usage is returned by the SDK but never read.
- Persistence is Convex (prod deployment `compassionate-basilisk-625`). The Next.js server already writes to Convex with `CONVEX_DEPLOY_KEY` (traces).
- Firebase project `machax-b8796` exists (analytics only, on `origin/main`). `firebase` JS SDK and `@capacitor-firebase/analytics` are installed. No OAuth client / SHA-1 registered yet.
- Android app is a static export calling `https://machax.xyz`; CORS allows only `Content-Type`.
- PrepClever uses Supabase Auth, not Firebase, so there is no Firebase login code to copy. It does have reusable patterns: Razorpay order/verify/webhook (HMAC verification, server-side pricing, idempotent grant) and RevenueCat for Play Billing with a webhook that grants on `NON_RENEWING_PURCHASE`.

## decisions

### identity: Firebase Auth, Google sign-in only

- Web: `firebase/auth` `signInWithPopup(GoogleAuthProvider)` (fallback to redirect on mobile browsers).
- Android: `@capacitor-firebase/authentication` (sibling of the analytics plugin already installed), Google provider, then `signInWithCredential` on the web SDK so `getIdToken()` works identically on both platforms.
- Server verification: Firebase ID tokens are RS256 JWTs. Verify with `jose` against Google's public certs (`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`), checking `iss = https://securetoken.google.com/machax-b8796`, `aud = machax-b8796`, `exp`. No service account, no firebase-admin, works on Vercel.
- One helper, `src/lib/server-auth.ts`: `requireUser(request) → { uid, email, name }` or throws 401. Used by `/api/chat` and every payment route.
- Username/password login and the anonymous demo are removed. Login is required before any message is sent. The landing page keeps its static content; the composer routes to login.
- Existing Convex `users` rows keep working: on first Firebase login, `/api/auth/session` (server) looks up `users` by email, sets `firebaseUid` on the match, otherwise creates a row (username derived from email local part, de-duplicated). Convex data stays keyed by `username`; the server maps `uid → username`. `claimDemoSession` is deleted with the demo.
- Admin check moves from hardcoded username to `ADMIN_UIDS` env (comma-separated Firebase uids).
- Client keeps `localStorage["machax-user"] = { username, name, uid }` for the existing UI, but every `/api/*` call sends `Authorization: Bearer <idToken>` fetched from the Firebase SDK at call time (it refreshes itself). CORS allow-headers gains `Authorization`.

### credit ledger: Convex, server-only

New tables in `convex/schema.ts`:

```
credits:  uid, username, balanceMicros, lifetimeSpentMicros, messageCount,
          inFlightSince?, createdAt, updatedAt            index by_uid
ledger:   uid, kind: "grant" | "charge" | "purchase",
          amountMicros (signed), ref (message id | order id | event id),
          meta (json string: model token counts, provider), createdAt
          index by_uid, index by_ref
orders:   uid, provider: "razorpay" | "play", providerOrderId, productId,
          amountPaise, status: "created" | "paid" | "failed" | "refunded",
          creditMicros, createdAt, paidAt?                 index by_providerOrderId
```

- Amounts are integer micro-dollars (1,000,000 = $1.00). Free grant: 1,000,000. Recharge: 2,000,000.
- All mutations on these tables are `internalMutation`s or guarded by `CONVEX_DEPLOY_KEY` admin auth, called only from Next.js routes. The client reads balance through `/api/credits` (server), never writes.
- `ensureCredits(uid)` grants the $1 exactly once (ledger `grant`, ref `free:<uid>`, unique by ref).
- `beginMessage(uid)`: refuses with `out_of_credit` if `balanceMicros <= 0`, refuses with `busy` if `inFlightSince` is under 90 s old (one message in flight per account, so the cap cannot be raced), else sets `inFlightSince`.
- `settleMessage(uid, costMicros, meta)`: subtracts cost (balance may go negative on the last message, that is the only allowed overdraft), appends ledger `charge`, bumps `messageCount`, clears `inFlightSince`. Always called in `finally`, with cost 0 if the request died.
- `grantPurchase(uid, ref, 2_000_000)`: idempotent by `ref`.

### metering

- `callAnthropic` returns `{ text, usage, model }` where `usage` is the SDK's `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. `msg.model` is used for pricing so a server-side fallback model is priced correctly.
- Price table in `src/lib/pricing.ts` (USD per million tokens): Sonnet 5.5 in 2.00 / out 10.00 / cache write 2.50 / cache read 0.20; Haiku 4.5 in 1.00 / out 5.00 / cache write 1.25 / cache read 0.10; unknown model falls back to Sonnet rates. Thinking tokens are already inside `output_tokens`.
- A per-request `CostCollector` object is created in `/api/chat`, passed into `orchestrateChat`, and every `callModel` adds to it. Bridge calls add `costUsd` from the bridge response; local `claude -p` calls add 0 and log a warning (dev only).
- After the orchestrator's `done` event the route calls `settleMessage`, then emits one more SSE event `credit: { balanceMicros, costMicros, messagesLeft }` so the UI updates without a round trip.

### "messages left"

- `messagesLeft = max(0, floor(balanceMicros / avgCostMicros))`.
- `avgCostMicros` = the account's own `lifetimeSpentMicros / messageCount` once `messageCount >= 3`, else `DEFAULT_MESSAGE_COST_MICROS` (env, set from a measurement step in the plan: run 5 real messages through the metered orchestrator and take the mean).
- UI copy: header pill "~12 messages left"; at 1 or 0: "last message" / "out of messages". Recharge sheet: "₹219 → about N more messages" using the same average.

### payments

Product id everywhere: `topup_219`. Price ₹219. Credit $2.00.

**Web, Razorpay** (reuse PrepClever's Razorpay account and key names; port the three edge functions to Next.js routes):

- `POST /api/pay/razorpay/order` (auth): amount hard-coded server-side to 21,900 paise, `notes.uid`, insert `orders` row, return `{ orderId, keyId, amount }`.
- `POST /api/pay/razorpay/verify` (auth): HMAC-SHA256(`order_id|payment_id`, key secret) must match `razorpay_signature`; fetch the payment from Razorpay and require `captured` with matching order and amount; `grantPurchase(uid, orderId)`.
- `POST /api/pay/razorpay/webhook` (no auth, signature): verify `x-razorpay-signature` with `RAZORPAY_WEBHOOK_SECRET`; on `payment.captured` grant (idempotent, so verify + webhook double-firing is harmless); on `payment.failed` mark order failed; on `refund.processed` subtract credit and mark refunded.
- Client: load `https://checkout.razorpay.com/v1/checkout.js`, open with the order, prefill email, on success call verify then refresh `/api/credits`.
- Only shown when `!Capacitor.isNativePlatform()`.

**Android, Google Play Billing via RevenueCat** (reuse PrepClever's RevenueCat account; add a machax app):

- Plugin `@revenuecat/purchases-capacitor`. `Purchases.configure({ apiKey, appUserID: uid })` after login.
- Recharge sheet calls `getProducts(["topup_219"])` then `purchaseStoreProduct`. Product is a consumable in Play Console; RevenueCat consumes it so it can be bought again.
- `POST /api/pay/revenuecat/webhook`: `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`; on `NON_RENEWING_PURCHASE` (and `INITIAL_PURCHASE` as a safety net) with `product_id = topup_219`, `grantPurchase(app_user_id, transaction_id)`. Other events are acknowledged and ignored.
- After the native purchase resolves, the client polls `/api/credits` for up to 20 s until the balance changes, then shows "credit added". If the webhook is late, the balance appears on next open.
- Only shown when `Capacitor.isNativePlatform()`.

### client changes

- `src/lib/firebase.ts`: app init (web config from `NEXT_PUBLIC_FIREBASE_*`), `signInWithGoogle()`, `getIdToken()`, `onAuthChange()`, platform-aware.
- `src/lib/api.ts`: `authedFetch(path, init)` that attaches the bearer token; chat-page and all other `/api` calls go through it.
- Login page: replace the form with one "Continue with Google" button plus the privacy policy link.
- Chat page: remove the demo path and `DEMO_MESSAGE_LIMIT`; add the balance pill, handle `credit` SSE events, handle 401 (send to login), 402 (open recharge sheet), 409 busy (toast "still replying, wait a moment").
- New `recharge-sheet.tsx`: platform picks Razorpay or Play; shows price and "about N more messages".
- Hand-written CSS as the rest of the app (no shadcn here; the codebase doesn't use it).

### env and config

Server (Vercel): `FIREBASE_PROJECT_ID=machax-b8796`, `ADMIN_UIDS`, `DEFAULT_MESSAGE_COST_MICROS`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `REVENUECAT_WEBHOOK_SECRET`.
Client: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY`.

### manual steps only the owner can do (not buildable by agents)

1. Firebase console: enable Google sign-in; add `machax.xyz` and `localhost` as authorized domains; register the Android app's debug and release SHA-1 and re-download `google-services.json`; copy the web app config.
2. Razorpay dashboard: add webhook `https://machax.xyz/api/pay/razorpay/webhook` with events `payment.captured`, `payment.failed`, `refund.processed`; note the webhook secret.
3. Play Console: create in-app product `topup_219`, consumable, ₹219. Upload a build to internal testing so Play Billing works.
4. RevenueCat: add the machax Android app (Play service credentials), add product `topup_219`, add webhook `https://machax.xyz/api/pay/revenuecat/webhook` with the bearer secret; copy the public Android SDK key.
5. Set the env vars above in Vercel and in `.env.local`.
6. Measure and set `DEFAULT_MESSAGE_COST_MICROS` (the plan includes the script).

### hardening follow-ups (out of scope, flagged)

- Convex client mutations trust a plain `username`. Wire `convex/auth.config.ts` to Firebase and switch to `ctx.auth` so conversations cannot be read by passing someone else's username.
- `/api/content/followup` spawns a local `claude` CLI with no auth. Put it behind `ADMIN_API_KEY` or delete it.
- Per-IP rate limit on login and order creation.

## open risk to flag

$1 may buy fewer messages than expected. One message fans out to up to ~10 Sonnet 5.5 calls with adaptive thinking. A rough estimate is $0.05 to $0.25 per message, so $1 is somewhere between 4 and 20 messages. The measurement step will give the real number before launch; the free grant and the recharge amount are single constants and can be changed then.

## left to the builder

- exact Convex function names and file split
- SSE event shape beyond the fields listed
- CSS for the pill and sheet, matching `chat.css`
- how `orchestrateChat` receives the collector (argument preferred over AsyncLocalStorage)
- test strategy: unit tests for pricing, HMAC verification, ledger idempotency; a scripted end-to-end run of `/api/chat` with a test token
