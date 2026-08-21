import { OPENAPI_SPEC } from "@/server/utils/openapi";
import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(OPENAPI_SPEC, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
