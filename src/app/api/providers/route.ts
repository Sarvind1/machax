export const dynamic = "force-dynamic";

import { getProviderStatus } from "@/lib/providers";

export async function GET() {
  const status = getProviderStatus();

  return Response.json({
    active: status.active
      ? { name: status.active.name, label: status.active.label, model: status.active.model }
      : null,
    providers: status.all.map((p) => ({
      name: p.name,
      label: p.label,
      model: p.model,
      available: p.available,
      reason: p.available ? undefined : p.reason,
      priority: p.priority,
    })),
  });
}
