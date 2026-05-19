export const dynamic = "force-dynamic";

import { getProviderStatus } from "@/lib/providers";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

export async function GET(request: Request) {
  const status = getProviderStatus();

  return Response.json(
    {
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
    },
    { headers: corsHeaders(request) }
  );
}
