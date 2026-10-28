import { ConvexHttpClient } from "convex/browser";

// Admin-authenticated Convex client for server routes. Needed to call
// internal functions (credits, users, traces). Throws if env is missing.
export function getConvexAdmin(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!convexUrl || !deployKey) throw new Error("convex admin not configured");
  const client = new ConvexHttpClient(convexUrl);
  (client as any).setAdminAuth(deployKey);
  return client;
}
