import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const country = request.headers.get("x-vercel-ip-country");
  // On Vercel, always set from the header. Locally (no header), respect existing cookie for testing.
  if (!country && request.cookies.get("geo")) {
    return NextResponse.next();
  }
  const geo = (country ?? "IN") === "IN" ? "in" : "global";
  const response = NextResponse.next();
  response.cookies.set("geo", geo, { path: "/", sameSite: "lax" });
  return response;
}

export const config = {
  matcher: ["/"],
};
