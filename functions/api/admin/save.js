// POST /api/admin/save   { packs: [...], categories: [...] }
// Only users whose session has isAdmin (i.e. they hold an admin role
// in the Discord server) can write.

import { verifySession, getCookie, isLiveAdmin } from "../../_lib/session.js";

export async function onRequestPost({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);

  if (!payload || !(await isLiveAdmin(payload, env))) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!env.SCENEAGB_KV) {
    return new Response(
      JSON.stringify({ error: "KV storage not configured — see SETUP.md" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "bad json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const packs = Array.isArray(body.packs) ? body.packs : null;
  const categories = Array.isArray(body.categories) ? body.categories : null;
  const exclusivePacks = Array.isArray(body.exclusivePacks) ? body.exclusivePacks : [];
  const exclusiveCategories = Array.isArray(body.exclusiveCategories) ? body.exclusiveCategories : [];

  if (!packs || !categories) {
    return new Response(JSON.stringify({ error: "packs and categories must be arrays" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // sanitise: keep only known fields, cap sizes
  const cleanPack = (p) => ({
    img: String(p.img || "").slice(0, 300),
    link: String(p.link || "").slice(0, 500),
    title: String(p.title || "").slice(0, 120),
    category: String(p.category || "").slice(0, 60),
    tags: (Array.isArray(p.tags) ? p.tags : []).slice(0, 10).map((t) => String(t).slice(0, 40)),
    res: String(p.res || "").slice(0, 20),
    size: String(p.size || "").slice(0, 20),
    added: Number(p.added) || 0,
  });
  const cleanPacks = packs.slice(0, 500).map(cleanPack).filter((p) => p.img && p.link);
  const cleanExclusivePacks = exclusivePacks.slice(0, 500).map(cleanPack).filter((p) => p.img && p.link);

  const cleanCats = (arr) => arr.slice(0, 50).map((c) => {
    if (typeof c === "string") return { name: c.slice(0, 60), img: "" };
    return {
      name: String(c.name || "").slice(0, 60),
      img: String(c.img || "").slice(0, 300),
      added: Number(c.added) || 0,
    };
  }).filter((c) => c.name);
  const cleanCategories = cleanCats(categories);
  const cleanExclusiveCategories = cleanCats(exclusiveCategories);

  await env.SCENEAGB_KV.put("packs", JSON.stringify(cleanPacks));
  await env.SCENEAGB_KV.put("categories", JSON.stringify(cleanCategories));
  await env.SCENEAGB_KV.put("exclusive-packs", JSON.stringify(cleanExclusivePacks));
  await env.SCENEAGB_KV.put("exclusive-categories", JSON.stringify(cleanExclusiveCategories));

  return new Response(JSON.stringify({ ok: true, saved: cleanPacks.length }), {
    headers: { "Content-Type": "application/json" },
  });
}
