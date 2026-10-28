This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## access controls: env, setup, cost

Login is Google sign-in through Firebase. Every account gets a credit balance, and each chat message is charged at what its model calls actually cost. Top-ups are ₹219, through Razorpay on the web and Google Play (via RevenueCat) in the Android app.

### env vars

Copy `.env.example` to `.env.local` for local work, and set the same values in Vercel's project settings. "client" vars are baked into the browser bundle at build time, so changing one needs a rebuild.

| name | side | what it is for |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | server | Firebase project whose ID tokens the API trusts (`machax-b8796`) |
| `DEFAULT_MESSAGE_COST_MICROS` | server | guessed cost of one message, in micro-dollars (1,000,000 = $1), used for "messages left" until an account has its own average. set it from the measurement script below |
| `RAZORPAY_KEY_ID` | server | Razorpay API key id (`rzp_test_...` in test mode) |
| `RAZORPAY_KEY_SECRET` | server | secret half of that key; also checks checkout success callbacks |
| `RAZORPAY_WEBHOOK_SECRET` | server | secret of the Razorpay webhook for `/api/pay/razorpay/webhook` |
| `REVENUECAT_WEBHOOK_SECRET` | server | any long random string; RevenueCat sends it as `Bearer <secret>` to `/api/pay/revenuecat/webhook` |
| `NEXT_PUBLIC_ADMIN_UIDS` | client | comma-separated Firebase uids allowed into `/admin`; empty means nobody |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | client | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | client | Firebase web app config (`machax-b8796.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | client | Firebase web app config (`machax-b8796`) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | client | Firebase web app config |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | client | same value as `RAZORPAY_KEY_ID`; checkout falls back to it if the order response lacks a key |
| `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY` | client | RevenueCat public Google Play key (`goog_...`); empty turns Play purchases off in the app |

### manual steps only the owner can do

1. **firebase console:** enable Google sign-in. Add `machax.xyz` and `localhost` as authorized domains. Register the Android app's debug and release SHA-1, then re-download `google-services.json`. Copy the web app config.
2. **razorpay dashboard:** add webhook `https://machax.xyz/api/pay/razorpay/webhook` with events `payment.captured`, `payment.failed`, `refund.processed`, and note the webhook secret. `refund.processed` is off by default, so tick it by hand. Turn on auto-capture for payments.
3. **play console:** create in-app product `topup_219`, consumable, ₹219. Upload a build to internal testing so Play Billing works.
4. **revenuecat:** add the machax Android app (Play service credentials) and product `topup_219`. Add webhook `https://machax.xyz/api/pay/revenuecat/webhook`. In its Authorization header field type `Bearer <secret>`, and put the same `<secret>` in `REVENUECAT_WEBHOOK_SECRET`. Copy the public Android SDK key.
5. **env vars:** set the vars above in Vercel and in `.env.local`.
6. **message cost:** measure and set `DEFAULT_MESSAGE_COST_MICROS` (see below).

**deploy order:** deploy Convex first, then Vercel (`./deploy.sh` does both in that order). Ship the new APK right after. The old APK's password login stops working once Convex prod is deployed.

### measuring message cost

```bash
npx tsx scripts/measure-message-cost.ts
```

It sends 5 starter messages to a 3-friend pod with the real Anthropic provider and prints each message's cost, the mean, and a ready line `DEFAULT_MESSAGE_COST_MICROS=<mean>` to paste into the env. It needs `ANTHROPIC_API_KEY` in `.env.local`, spends real credit, and takes several minutes because replies arrive at chat pace.
