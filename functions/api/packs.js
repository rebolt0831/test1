// GET /api/packs
// Public. Returns { packs, categories } from KV storage.
// Falls back to the static packs.json (and empty categories) if KV is empty
// or the KV binding hasn't been set up yet.

export async function onRequestGet({ request, env }) {
  let packs = null;
  let categories = [];

  try {
    if (env.SCENEAGB_KV) {
      packs = await env.SCENEAGB_KV.get("packs", "json");
      categories = (await env.SCENEAGB_KV.get("categories", "json")) || [];
    }
  } catch (e) {
    // KV not bound — fall through to static file
  }

  if (!packs) {
    try {
      const res = await env.ASSETS.fetch(new URL("/packs.json", request.url));
      packs = await res.json();
    } catch (e) {
      packs = [];
    }
  }

  return new Response(JSON.stringify({ packs, categories }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
