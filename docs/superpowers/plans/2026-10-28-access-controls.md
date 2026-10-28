# Access Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require Firebase Google login for every chat, meter real token cost per message against a $1 free credit, and sell a ₹219 → $2 top-up via Razorpay (web) and Google Play Billing through RevenueCat (Android).

**Architecture:** Firebase ID tokens are verified in Next.js API routes with `jose` (no admin SDK). Credits live in Convex tables written only by server-side internal mutations through the existing `CONVEX_DEPLOY_KEY` admin client. `/api/chat` gates on balance, collects usage from every Anthropic call through a per-request `CostCollector`, settles the charge after the stream, and emits a `credit` SSE event. Payment routes port PrepClever's Razorpay and RevenueCat webhook patterns.

**Tech Stack:** Next.js 16 (App Router, route handlers), Convex 1.36, Firebase JS SDK 12 + `@capacitor-firebase/authentication`, `jose`, `@revenuecat/purchases-capacitor`, Razorpay Checkout.js, vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-access-controls-design.md`

## Global Constraints

- Work only in worktree `/Users/sarvind/Projects/machax-access`, branch `access-controls`. Never touch `~/Projects/machax`.
- Before any `convex` or `next` command: `cp ../machax/.env.local .env.local` if `.env.local` is missing (gitignored; it carries `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `ANTHROPIC_API_KEY`). Never commit it.
- Node is `/opt/homebrew/bin/node`; use `npx` from the worktree. Tests: `npx vitest run <file>`. Typecheck: `npx tsc --noEmit`.
- Money is integer micro-dollars (1,000,000 = $1.00). Free grant `1_000_000`. Top-up `2_000_000`. Price `21_900` paise. Product id `topup_219`.
- Pricing per million tokens: Sonnet 5.5 in 2.00 / out 10.00 / cache-write 2.50 / cache-read 0.20. Haiku 4.5 in 1.00 / out 5.00 / cache-write 1.25 / cache-read 0.10. Unknown model → Sonnet rates.
- Firebase project `machax-b8796`. Token issuer `https://securetoken.google.com/machax-b8796`, audience `machax-b8796`, JWKS `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`.
- UI copy is lowercase, direct, no corporate tone. Balance is shown as messages, never dollars.
- Hand-written CSS in the existing `*.css` files; no new UI libraries.
- Commit after each task with `git add <named files>` only. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Follow `AGENTS.md`: read `node_modules/next/dist/docs/` before writing route-handler or client code if unsure of Next 16 APIs.

## Review Focus

1. **Expired or foreign token** on `/api/chat`: a token from another Firebase project, or one past `exp`, must get 401, not be treated as a user. (Task 3 tests.)
2. **Race past the cap**: two `/api/chat` requests for the same uid fired together must not both run; the second gets 409 `busy`. (Task 4 tests.)
3. **Double grant on purchase**: Razorpay `verify` and `webhook` both fire for one order; RevenueCat retries a webhook. Balance must rise exactly once per order. (Task 4 and Task 9 tests.)
4. **Orchestrator throws mid-stream** after some model calls ran: the partial cost must still be charged and `inFlightSince` cleared, so the user is not locked out for 90 s. (Task 6 test.)
5. **Tampered amount**: a client posting its own `amount` to the Razorpay order route must still be charged 21,900 paise; a captured payment with a different amount must not grant. (Task 9 tests.)

---

### Task 0: Worktree setup

**Files:**
- Create: `.env.local` (copied, never committed)

- [ ] **Step 1:** `cd /Users/sarvind/Projects/machax-access && cp ../machax/.env.local .env.local && npm install`
- [ ] **Step 2:** Verify baseline: `npx vitest run` passes and `npx tsc --noEmit` exits 0. Record any pre-existing failures in the task report; do not fix them.

### Task 1: Pricing and cost collector

**Files:**
- Create: `src/lib/pricing.ts`, `src/lib/cost-collector.ts`
- Test: `src/lib/pricing.test.ts`, `src/lib/cost-collector.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // pricing.ts
  export type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
  export function costMicros(model: string, usage: Usage): number; // rounds up to whole micro-dollars
  export function usdToMicros(usd: number): number;
  // cost-collector.ts
  export type ModelCallRecord = { model: string; usage?: Usage; costMicros: number; source: "anthropic" | "bridge" | "cli" | "gemini" };
  export class CostCollector {
    add(record: ModelCallRecord): void;
    addAnthropic(model: string, usage: Usage): void;   // computes costMicros via costMicros()
    addBridge(costUsd: number | undefined): void;      // undefined → 0 and a console.warn
    get totalMicros(): number;
    get calls(): readonly ModelCallRecord[];
    toMeta(): string; // JSON: { calls: number, byModel: Record<model, {input, output, cacheRead, cacheWrite, costMicros}> }
  }
  ```

- [ ] **Step 1: Write failing tests**
  - `costMicros("claude-sonnet-5-5", {input_tokens: 1_000_000, output_tokens: 0})` → `2_000_000`
  - `costMicros("claude-haiku-4-5", {input_tokens: 0, output_tokens: 100_000})` → `500_000`
  - `costMicros("claude-sonnet-5-5", {input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000})` → `2_700_000`
  - `costMicros("something-new", {input_tokens: 1_000_000, output_tokens: 0})` → `2_000_000` (Sonnet fallback)
  - `costMicros("claude-sonnet-5-5", {input_tokens: 1, output_tokens: 0})` → `2` (ceil, never 0 for non-zero usage)
  - collector: two `addAnthropic` calls sum; `addBridge(undefined)` adds 0; `toMeta()` parses and has `calls: 2`.
- [ ] **Step 2:** `npx vitest run src/lib/pricing.test.ts src/lib/cost-collector.test.ts` → FAIL (modules missing)
- [ ] **Step 3:** Implement both modules. Match models by prefix (`claude-sonnet-5-5`, `claude-haiku-4-5`); store rates as micro-dollars per token to avoid float drift (e.g. Sonnet input = 2 micros/token).
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit `feat(credits): token pricing table and per-request cost collector`.

### Task 2: Meter every model call in the orchestrator

**Files:**
- Modify: `src/lib/orchestrator.ts` (`callClaudeViaBridge` ~99-135, `callAnthropic` ~289-321, `callModel` ~324-345, `orchestrateChat` params ~1369, call sites 1182, 1239, 1323, 1797)

**Interfaces:**
- Consumes: `CostCollector` (Task 1).
- Produces: `orchestrateChat(params & { collector?: CostCollector })`. Every `callModel` call inside passes the collector through; callers outside the route (scripts, evals) omit it and nothing changes.

- [ ] **Step 1:** Change `callAnthropic` to return `{ text: string; model: string; usage: Usage }`, taking `model` and `usage` from `msg` (`msg.model` may differ from the requested model when the server-side fallback ran).
- [ ] **Step 2:** Change `callClaudeViaBridge` to return `{ text: string; costUsd?: number }` reading `data.costUsd`; thread it through `callClaudeCli`, which returns `{ text, costUsd? }` (local `claude -p` path returns `costUsd: undefined`).
- [ ] **Step 3:** Add `collector?: CostCollector` as the last parameter of `callModel`. On anthropic success call `collector?.addAnthropic(result.model, result.usage)`; on bridge/cli call `collector?.addBridge(costUsd)`; on gemini call `collector?.add({ model, costMicros: 0, source: "gemini" })`. Return type unchanged.
- [ ] **Step 4:** Add `collector` to `orchestrateChat` params and pass it at all four `callModel` call sites (friend reply, retry, topic context, decision synthesis).
- [ ] **Step 5:** `npx tsc --noEmit` exits 0; `npx vitest run` still passes.
- [ ] **Step 6:** Smoke: `ANTHROPIC_API_KEY` from `.env.local`, run a one-off script (in the scratchpad, not committed) that calls `orchestrateChat` with a collector for the message "should i quit my job" and pod `["ananya","rahul"]` (check `src/lib/friends.ts` for valid ids), drains the generator, and prints `collector.totalMicros` and `collector.toMeta()`. Expected: totalMicros > 0 and `byModel` lists a Sonnet and a Haiku entry. Paste the numbers in the task report.
- [ ] **Step 7:** Commit `feat(credits): collect token usage and cost from every model call`.

### Task 3: Server-side Firebase token verification and CORS

**Files:**
- Create: `src/lib/server-auth.ts`
- Modify: `src/lib/cors.ts:15` (allow `Authorization`)
- Test: `src/lib/server-auth.test.ts`
- Install: `jose`

**Interfaces:**
- Produces:
  ```ts
  export type AuthedUser = { uid: string; email?: string; name?: string };
  export class AuthError extends Error { status: 401 }
  export async function requireUser(request: Request, opts?: { jwks?: JWTVerifyGetKey }): Promise<AuthedUser>; // reads "Authorization: Bearer <token>"
  export function authErrorResponse(err: unknown, request: Request): Response | null; // 401 JSON {error:"unauthorized"} with CORS headers when err is AuthError, else null
  ```
- `jwks` defaults to `createRemoteJWKSet(new URL(JWKS_URL))`, module-cached. `FIREBASE_PROJECT_ID` env, default `machax-b8796`.

- [ ] **Step 1: Write failing tests** using `jose` `generateKeyPair("RS256")` and `new SignJWT(...)`, passing a local `jwks` resolver that returns the test public key:
  - valid token with `iss`, `aud`, `sub: "uid1"`, `email`, `name` → `{uid:"uid1", email, name}`
  - wrong `aud` → throws `AuthError`
  - wrong `iss` → throws `AuthError`
  - expired (`exp` 60 s ago) → throws `AuthError`
  - missing header → throws `AuthError`
  - `alg: "none"` or HS256 token → throws `AuthError`
- [ ] **Step 2:** Tests FAIL.
- [ ] **Step 3:** Implement with `jwtVerify(token, jwks, { issuer, audience, algorithms: ["RS256"] })`. Map `payload.sub` → `uid`; `payload.email`, `payload.name`.
- [ ] **Step 4:** Tests PASS. Update `cors.ts` allow-headers to `"Content-Type, Authorization"`.
- [ ] **Step 5:** Commit `feat(auth): verify Firebase ID tokens server-side with jose`.

### Task 4: Convex credits ledger and user upsert

**Files:**
- Modify: `convex/schema.ts` (add `credits`, `ledger`, `orders`; add `firebaseUid: v.optional(v.string())` to `users` with index `by_firebaseUid`)
- Create: `convex/credits.ts`, `convex/orders.ts`
- Modify: `convex/users.ts` (add `upsertFromFirebase`; delete `signup`, `login`, `createDemoUser`, `claimDemoSession`)
- Test: `convex/credits.test.ts` using `convex-test` (install as dev dep) with `vitest` `environment: "edge-runtime"` per convex-test docs; add `@edge-runtime/vm` dev dep. Check `node_modules/convex-test/README.md` after install.

**Interfaces:**
- Produces (all `internalMutation` / `internalQuery`, called from Next with the admin client as `internal.credits.*`):
  ```ts
  credits.ensure({ uid, username })            → { balanceMicros }          // grants FREE_GRANT_MICROS once, ledger kind "grant", ref `free:${uid}`
  credits.beginMessage({ uid })                → { ok: true } | { ok: false, reason: "out_of_credit" | "busy" | "no_account" }
  credits.settleMessage({ uid, costMicros, ref, meta }) → { balanceMicros, lifetimeSpentMicros, messageCount }
  credits.grantPurchase({ uid, amountMicros, ref, meta }) → { granted: boolean, balanceMicros }  // idempotent on ledger.ref
  credits.adjust({ uid, amountMicros, ref, meta })         → same shape; used for refunds (negative)
  credits.get({ uid })                         → { balanceMicros, lifetimeSpentMicros, messageCount } | null
  orders.create({ uid, provider, providerOrderId, productId, amountPaise, creditMicros }) → orderId
  orders.getByProviderOrderId({ providerOrderId }) → order | null
  orders.setStatus({ providerOrderId, status, paidAt? })
  users.upsertFromFirebase({ uid, email?, name? }) → { username, name, created: boolean }
  ```
- Constants in `convex/credits.ts`: `FREE_GRANT_MICROS = 1_000_000`, `IN_FLIGHT_STALE_MS = 90_000`.
- `upsertFromFirebase`: find by `firebaseUid`; else by `email` (set `firebaseUid`); else create with username = email local part lowercased, `[^a-z0-9_]` stripped, suffixed `-2`, `-3`… until unique (fallback `user-<first 8 of uid>` when no email). `password` field: store `""` for new rows.

- [ ] **Step 1: Write failing tests** (`convex-test`):
  - `ensure` twice → balance `1_000_000`, exactly one `grant` ledger row
  - `beginMessage` with balance 0 → `out_of_credit`; with fresh `inFlightSince` → `busy`; with `inFlightSince` 100 s old → `ok`
  - `settleMessage(300_000)` after begin → balance `700_000`, `messageCount 1`, `inFlightSince` cleared; settle can push balance negative
  - `grantPurchase` same `ref` twice → second returns `granted: false`, balance rose once
  - `upsertFromFirebase` matches an existing row by email and sets `firebaseUid`; a second call with same uid returns the same username; username collision gets `-2`
- [ ] **Step 2:** Tests FAIL.
- [ ] **Step 3:** Implement schema and functions. `beginMessage` does read-then-write inside one mutation (Convex mutations are serializable, so this is the race guard).
- [ ] **Step 4:** Tests PASS. `npx convex dev --once` pushes to the dev deployment and regenerates `convex/_generated`; `npx tsc --noEmit` exits 0 (removing `signup`/`login` will break `login-page.tsx`; that file is rewritten in Task 7 — for now leave the imports compiling by stubbing nothing: if tsc fails only in `login-page.tsx`, note it and proceed; Task 7 fixes it).
- [ ] **Step 5:** Commit `feat(credits): Convex credits ledger, orders, Firebase user upsert`.

### Task 5: Credits read API and session bootstrap

**Files:**
- Create: `src/lib/credits.ts`, `src/lib/convex-server.ts`, `src/app/api/credits/route.ts`, `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/chat/route.ts:53-60` (move `getConvexClient` to `convex-server.ts` and import it)
- Test: `src/lib/credits.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // credits.ts
  export const TOPUP_MICROS = 2_000_000; export const TOPUP_PAISE = 21_900; export const TOPUP_PRODUCT_ID = "topup_219";
  export function defaultMessageCostMicros(): number; // env DEFAULT_MESSAGE_COST_MICROS, fallback 150_000
  export function avgCostMicros(s: { lifetimeSpentMicros: number; messageCount: number }): number; // own average when messageCount >= 3 else default
  export function messagesLeft(balanceMicros: number, avg: number): number; // max(0, floor)
  export type CreditSummary = { balanceMicros: number; messagesLeft: number; topupMessages: number; avgCostMicros: number };
  export function summarize(s: { balanceMicros; lifetimeSpentMicros; messageCount }): CreditSummary; // topupMessages = floor(TOPUP_MICROS / avg)
  // convex-server.ts
  export function getConvexAdmin(): ConvexHttpClient; // throws if env missing
  // routes
  GET  /api/credits          (auth) → CreditSummary  (calls credits.ensure first so a first-time user sees $1)
  POST /api/auth/session     (auth) → { uid, username, name, credits: CreditSummary }  (upsertFromFirebase + ensure)
  ```
- Both routes export `OPTIONS` via `handleCorsOptions` and add `corsHeaders` to every response, like `/api/chat`.

- [ ] **Step 1: Write failing tests** for `credits.ts`: `messagesLeft(1_000_000, 150_000)` → 6; `messagesLeft(-5, 150_000)` → 0; `avgCostMicros({lifetimeSpentMicros: 900_000, messageCount: 3})` → 300_000; with `messageCount: 2` → default; `summarize` with balance 1_000_000 and no history → `topupMessages 13`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; `npx tsc --noEmit` clean for these files.
- [ ] **Step 5:** Manual check with `npx next dev`: `curl -i localhost:3000/api/credits` → 401 JSON. (A real token test happens in Task 7 once login exists.)
- [ ] **Step 6:** Commit `feat(credits): credits summary and session routes`.

### Task 6: Gate `/api/chat` on login and balance; settle and emit credit

**Files:**
- Modify: `src/app/api/chat/route.ts` (POST handler ~120-175, `iteratorToStream` ~62-118)
- Test: `src/app/api/chat/route.test.ts` (vitest, `vi.mock` for `@/lib/server-auth`, `@/lib/convex-server`, `@/lib/orchestrator`)

**Interfaces:**
- Consumes: `requireUser`, `authErrorResponse` (Task 3); `getConvexAdmin`, `summarize` (Task 5); `CostCollector` (Task 1); `internal.credits.*` (Task 4).
- Produces: SSE event `data: {"credit": { "balanceMicros", "messagesLeft", "costMicros", "topupMessages" }}` emitted right before `{"done":true}`. Error responses: 401 `{error:"unauthorized"}`, 402 `{error:"out_of_credit", credits: CreditSummary}`, 409 `{error:"busy"}`. `userName` body field is ignored for identity; the display name comes from `users.upsertFromFirebase` result (`name ?? username`).

- [ ] **Step 1: Write failing tests**: no header → 401; `beginMessage` mocked `out_of_credit` → 402 with `credits`; mocked `busy` → 409; happy path streams, `settleMessage` called once with `costMicros` from the collector, and the second-to-last SSE line contains `"credit"`; orchestrator mock that throws after yielding one event → `settleMessage` still called (cost of calls so far), stream ends with `done`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement: `requireUser` → `upsertFromFirebase` → `ensure` → `beginMessage`; create `collector`; pass into `orchestrateChat`; in `iteratorToStream` on `done` or error, `await settle()` exactly once (guard with a flag), enqueue the `credit` event, then `done`. `settle` = `credits.settleMessage({ uid, costMicros: collector.totalMicros, ref: conversationId ?? crypto.randomUUID(), meta: collector.toMeta() })` then `summarize`.
- [ ] **Step 4:** PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(chat): require login, enforce credit, charge real cost per message`.

### Task 7: Client login with Firebase Google sign-in

**Files:**
- Create: `src/lib/firebase.ts`, `src/lib/api.ts`
- Modify: `src/app/login-page.tsx` (replace form), `src/app/login.css`, `src/app/page.tsx` (remove demo), `capacitor.config.ts`, `android/app/build.gradle` + `android/build.gradle` if the plugin README requires it, `package.json`
- Install: `@capacitor-firebase/authentication` (same major as `@capacitor-firebase/analytics`), then `npx cap sync android`

**Interfaces:**
- Produces:
  ```ts
  // firebase.ts (client only)
  export type AuthedUserClient = { uid: string; email?: string; name?: string };
  export function getFirebaseAuth(): Auth;
  export async function signInWithGoogle(): Promise<AuthedUserClient>; // {uid,email,name}; native → FirebaseAuthentication.signInWithGoogle then signInWithCredential; web → signInWithPopup, redirect fallback on popup-blocked
  export async function getIdToken(): Promise<string | null>;
  export function onAuthChange(cb: (u: AuthedUserClient | null) => void): () => void;
  export async function signOut(): Promise<void>;
  // api.ts
  export async function authedFetch(path: string, init?: RequestInit): Promise<Response>; // prefixes API_BASE, adds Bearer token; throws AuthRequired (class) when no token
  export async function bootstrapSession(): Promise<SessionResult>; // POST /api/auth/session, stores localStorage["machax-user"] = {username,name,uid}
  ```
- Env (client): `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`. Add placeholders to `.env.example` (create if absent) with every env name from the spec.
- Capacitor config: `plugins: { FirebaseAuthentication: { skipNativeAuth: false, providers: ["google.com"] } }`.

- [ ] **Step 1:** Install the plugin; read its README under `node_modules/@capacitor-firebase/authentication/README.md` for Android setup (google-services already applied for analytics; note the `default_web_client_id` requirement, which needs the owner's OAuth client, see spec manual step 1).
- [ ] **Step 2:** Implement `firebase.ts` and `api.ts`.
- [ ] **Step 3:** Rewrite `login-page.tsx`: one `continue with google` button, the existing logo/tagline, privacy policy link kept, error line on failure; on success `bootstrapSession()` then `router.push("/chat")`. Delete signup/password/reset UI and the `users.signup`/`users.login`/`claimDemoSession` calls. Keep the file's existing look (reuse `login.css` classes).
- [ ] **Step 4:** `page.tsx`: logged-in → `/chat`; else → `/login`. Remove `DEMO_MESSAGE_LIMIT` and the `demoMode` render.
- [ ] **Step 5:** `npx tsc --noEmit` clean (this also clears Task 4's leftover). `npx next build` succeeds.
- [ ] **Step 6:** Browser check with Playwright against `npx next dev` (web only; needs the owner's Firebase web config in `.env.local`; if absent, verify the page renders the button and the console error names the missing config, and say so in the report).
- [ ] **Step 7:** Commit `feat(auth): Firebase Google sign-in replaces password login and demo mode`.

### Task 8: Chat page: auth header, balance pill, out-of-credit handling

**Files:**
- Modify: `src/app/chat/chat-page.tsx` (fetch ~291, `!response.ok` ~311, SSE handling ~320-400, `handleSubmit` ~437-450, demo helpers 56-90, auth effect ~100-114, header JSX), `src/app/chat/chat.css`, `src/app/chat/page.tsx`
- Create: `src/app/chat/components/credit-pill.tsx`, `src/app/chat/components/recharge-sheet.tsx` (shell: shows price, "about N more messages", one button; the button calls `onBuy()` prop, wired in Tasks 9-10)
- Test: `src/lib/credits.test.ts` already covers math; add `src/app/chat/components/credit-pill.test.tsx` with `@testing-library/react` (install dev dep + `jsdom`) for the three copy states.

**Interfaces:**
- Consumes: `authedFetch`, `AuthRequired` (Task 7); `CreditSummary` (Task 5); `credit` SSE event and 401/402/409 (Task 6).
- Produces: `CreditPill({ credits: CreditSummary | null, onClick })` copy: `~N messages left` (N ≥ 2), `last message` (N = 1), `out of messages` (N = 0). `RechargeSheet({ open, credits, onClose, onBuy, busy, error })` copy: title `top up`, line `₹219 → about {topupMessages} more messages`, button `pay ₹219`.

- [ ] **Step 1:** Write the pill tests (three states); FAIL.
- [ ] **Step 2:** Implement pill and sheet shell with CSS in `chat.css` (pill in the header next to the group name; sheet as a bottom sheet on mobile, centered card on desktop).
- [ ] **Step 3:** Chat page: delete demo helpers and `demoMode` prop paths; replace `fetch` with `authedFetch`; on load call `authedFetch("/api/credits")` and store `credits`; parse `credit` SSE events into `credits`; on 401 or `AuthRequired` → `router.push("/login")`; on 402 → set `credits` from body and open the sheet; on 409 → inline toast `still replying, give it a sec`; in `handleSubmit` if `credits?.messagesLeft === 0` open the sheet instead of sending.
- [ ] **Step 4:** `npx tsc --noEmit` clean; tests pass; `npx next build` succeeds.
- [ ] **Step 5:** Commit `feat(chat): balance pill, credit updates, recharge sheet shell`.

### Task 9: Razorpay top-up (web)

**Files:**
- Create: `src/lib/razorpay.ts`, `src/app/api/pay/razorpay/order/route.ts`, `src/app/api/pay/razorpay/verify/route.ts`, `src/app/api/pay/razorpay/webhook/route.ts`, `src/lib/razorpay-checkout.ts` (client)
- Modify: `src/app/chat/components/recharge-sheet.tsx` (web branch), `src/app/chat/chat-page.tsx` (refresh credits after purchase)
- Test: `src/lib/razorpay.test.ts`, `src/app/api/pay/razorpay/routes.test.ts` (mocks for convex admin + `fetch`)
- Reference: `/Users/sarvind/Projects/prepclever/supabase/functions/razorpay-*/index.ts` and `_shared/razorpay.ts` (read-only; port the HMAC and grant logic)

**Interfaces:**
- Produces:
  ```ts
  // razorpay.ts
  export function signCheckout(orderId: string, paymentId: string, secret: string): string; // hex HMAC-SHA256 of `${orderId}|${paymentId}`
  export function verifyCheckoutSignature(orderId, paymentId, signature, secret): boolean; // timing-safe
  export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
  export async function createOrder(amountPaise: number, notes: Record<string,string>, keyId, keySecret): Promise<{ id: string }>; // POST https://api.razorpay.com/v1/orders, receipt = crypto.randomUUID()
  export async function fetchPayment(paymentId, keyId, keySecret): Promise<{ status: string; order_id: string; amount: number }>;
  // routes
  POST /api/pay/razorpay/order   (auth) → { orderId, keyId, amount: 21900, currency: "INR" }   // ignores any body amount; orders.create with creditMicros TOPUP_MICROS
  POST /api/pay/razorpay/verify  (auth) body { orderId, paymentId, signature } → { granted, credits: CreditSummary }  // signature + fetchPayment captured + amount match + order.uid === uid
  POST /api/pay/razorpay/webhook (signature) → 200 { ok } ; payment.captured → grantPurchase(ref = orderId); payment.failed → status failed; refund.processed → credits.adjust(-creditMicros, ref `refund:${refundId}`) + status refunded
  // razorpay-checkout.ts
  export async function buyTopupWeb(): Promise<{ granted: boolean; credits: CreditSummary }>; // loads checkout.js once, opens with order, resolves after verify
  ```
- Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`. Webhook route must read `await request.text()` for the raw body before parsing.

- [ ] **Step 1: Write failing tests**: `verifyCheckoutSignature` round-trips with `signCheckout` and rejects a flipped byte; `verifyWebhookSignature` likewise; order route with body `{amount: 1}` still calls `createOrder` with `21900`; verify route with payment amount `21800` → 400 and no grant; webhook `payment.captured` twice → `grantPurchase` called twice but balance rises once (mock returns `granted:false` second time) and both return 200; bad webhook signature → 400.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; tsc clean.
- [ ] **Step 5:** Sheet web branch calls `buyTopupWeb()`, shows `credit added · ~N messages` on success, then `onClose`. Chat page sets `credits` from the result.
- [ ] **Step 6:** If `RAZORPAY_KEY_ID` test keys are present in `.env.local`, run `npx next dev` and complete one test-mode checkout in Playwright (test card `4111 1111 1111 1111`); else report "not run: no Razorpay keys".
- [ ] **Step 7:** Commit `feat(pay): Razorpay ₹219 top-up on web`.

### Task 10: Google Play top-up via RevenueCat (Android)

**Files:**
- Create: `src/app/api/pay/revenuecat/webhook/route.ts`, `src/lib/purchases-native.ts`
- Modify: `src/app/chat/components/recharge-sheet.tsx` (native branch), `src/lib/firebase.ts` or `src/app/chat/chat-page.tsx` (configure RevenueCat after login with `appUserID = uid`), `package.json`
- Install: `@revenuecat/purchases-capacitor` (Capacitor 8 compatible major); `npx cap sync android`
- Test: `src/app/api/pay/revenuecat/webhook.test.ts`
- Reference: `/Users/sarvind/Projects/prepclever/supabase/functions/revenuecat-webhook/index.ts`, `/Users/sarvind/Projects/prepclever/lib/purchases.ts` (read-only)

**Interfaces:**
- Produces:
  ```ts
  // purchases-native.ts (no-op on web)
  export async function configurePurchases(uid: string): Promise<void>; // Purchases.configure({ apiKey: NEXT_PUBLIC_REVENUECAT_ANDROID_KEY, appUserID: uid }) once, logIn on uid change
  export async function buyTopupNative(): Promise<{ started: true }>; // getProducts(["topup_219"]) → purchaseStoreProduct; throws on cancel with code "cancelled"
  export async function waitForCredit(prev: number, fetchCredits: () => Promise<CreditSummary>, timeoutMs = 20_000): Promise<CreditSummary | null>; // poll every 2 s until balanceMicros > prev
  // webhook
  POST /api/pay/revenuecat/webhook  header Authorization: Bearer REVENUECAT_WEBHOOK_SECRET
    event.type in ["NON_RENEWING_PURCHASE","INITIAL_PURCHASE"] && product_id === "topup_219" → grantPurchase(uid = app_user_id, ref = `rc:${event.transaction_id ?? event.id}`) → 200 {ok, granted}
    other types → 200 {ok, ignored: type}; bad bearer → 401
  ```

- [ ] **Step 1: Write failing webhook tests**: bad bearer → 401; `NON_RENEWING_PURCHASE` topup → grant called with `amountMicros 2_000_000`; same `transaction_id` twice → second `granted:false`; `RENEWAL` → ignored; wrong `product_id` → ignored.
- [ ] **Step 2:** FAIL. **Step 3:** Implement webhook and `purchases-native.ts` per the plugin README (`node_modules/@revenuecat/purchases-capacitor/README.md`). **Step 4:** PASS; tsc clean.
- [ ] **Step 5:** Sheet native branch: `buyTopupNative()` → `waitForCredit` → `credit added` or `payment done, credit will show up shortly` on timeout; cancel closes silently.
- [ ] **Step 6:** `npm run build:android` produces an APK (device purchase cannot be tested until the owner finishes spec manual steps 3-4; say so).
- [ ] **Step 7:** Commit `feat(pay): Google Play ₹219 top-up through RevenueCat`.

### Task 11: Admin gate, cleanup, measurement script, docs

**Files:**
- Modify: `src/app/admin/layout.tsx:6,20` (compare `uid` from `localStorage["machax-user"]` with `NEXT_PUBLIC_ADMIN_UIDS`; server routes under `/api/admin` if any use `ADMIN_API_KEY` unchanged), `README.md` (env table + manual steps copied from spec), `.env.example`
- Create: `scripts/measure-message-cost.ts`
- Delete: any now-unused demo code (`DEMO_POD_IDS` if unreferenced), `convex/passwordResets.ts` and its `RESEND_API_KEY` use if nothing references them after Task 7 (grep first; leave if referenced).

- [ ] **Step 1:** `scripts/measure-message-cost.ts`: runs `orchestrateChat` with a `CostCollector` for 5 fixed starter messages (take them from `STARTERS` in `chat-page.tsx`) against a 3-friend pod, prints per-message micros and the mean, and prints the line `DEFAULT_MESSAGE_COST_MICROS=<mean>`. Run it once (costs about $1); put the output in the task report and set the value in `.env.example` as the documented default.
- [ ] **Step 2:** Admin gate change; grep for dead code and delete it; `npx tsc --noEmit`, `npx vitest run`, `npx next build` all clean.
- [ ] **Step 3:** README: env table, the six manual steps from the spec, and how to run the measurement script.
- [ ] **Step 4:** Commit `chore(credits): admin uid gate, dead demo code removed, cost measurement script, docs`.

### Task 12: Whole-branch verification

- [ ] **Step 1:** `npx vitest run`, `npx tsc --noEmit`, `npx next build`, `npm run build:android` all pass; paste the summary lines.
- [ ] **Step 2:** Scripted end-to-end against `npx next dev` with a real Firebase token (only if the owner's web config is present; otherwise against the route tests): sign in, `GET /api/credits` shows `1_000_000`, one `/api/chat` message lowers it and streams a `credit` event, a second request fired concurrently gets 409.
- [ ] **Step 3:** `git log origin/main..HEAD` lists only this branch's commits. Do not merge or push; report back.
