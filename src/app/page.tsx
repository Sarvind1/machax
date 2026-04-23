import { cookies } from "next/headers";
import HomePage from "./home-page";

export default async function Page() {
  const cookieStore = await cookies();
  const geo = cookieStore.get("geo")?.value ?? "in";
  const locale = geo === "in" ? "in" : "global";
  return <HomePage locale={locale} />;
}
