import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { internal } from "../../convex/_generated/api";
import { getConvexAdmin } from "./convex-server";
import { requireUser, type AuthedUser } from "./server-auth";

// ConvexHttpClient's own types only accept public functions. The admin client
// can call internal ones, so narrow it to a typed mutation caller.
type AdminMutations = {
  mutation<F extends FunctionReference<"mutation", "internal">>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
};

export type CreditsRow = FunctionReturnType<typeof internal.credits.ensure>;

// Verify the Firebase token, link or create the app user, and make sure the
// credits row exists (first call grants the free $1). Auth failures throw
// AuthError; callers turn it into a 401 via authErrorResponse.
export async function bootstrapUser(request: Request): Promise<{
  user: AuthedUser;
  username: string;
  name: string | undefined;
  row: CreditsRow;
  // Stored gender (src/lib/gender.ts) and the name it was worked out from.
  gender?: string;
  genderFor?: string;
}> {
  const user = await requireUser(request);
  const client = getConvexAdmin() as unknown as AdminMutations;
  const { username, name, gender, genderFor } = await client.mutation(internal.users.upsertFromFirebase, {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
  });
  const row = await client.mutation(internal.credits.ensure, { uid: user.uid, username, googleId: user.googleId });
  return { user, username, name, row, gender, genderFor };
}
