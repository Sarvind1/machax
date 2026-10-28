// Parses NEXT_PUBLIC_ADMIN_UIDS: comma-separated Firebase uids allowed into
// /admin. Entries are trimmed and empties dropped; unset or empty means nobody.
export function parseAdminUids(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}
