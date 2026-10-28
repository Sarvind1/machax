import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

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

// ConvexHttpClient's own types only accept public functions. The admin client
// can call internal ones: cast getConvexAdmin() to this to call them typed.
export type InternalAdmin = {
  query<F extends FunctionReference<"query", "internal">>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
  mutation<F extends FunctionReference<"mutation", "internal">>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
};
