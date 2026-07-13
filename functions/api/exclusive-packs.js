// GET /api/exclusive-packs
// Booster-tier only. Returns { packs, categories } managed from the admin panel (KV).

import { verifySession, getCookie } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);

  if (!payload || !payload.hasExclusive) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let packs = [];
  let categories = [];
  try {
    if (env.SCENEAGB_KV) {
      packs = (await env.SCENEAGB_KV.get("exclusive-packs", "json")) || [];
      categories = (await env.SCENEAGB_KV.get("exclusive-categories", "json")) || [];
    }
  } catch (e) {}

  return new Response(JSON.stringify({ packs, categories }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
