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
  const baseVersion = Number.isFinite(+body.baseVersion) ? +body.baseVersion : -1;

  // ---- concurrent-edit guard: if someone saved since this admin loaded,
  //      refuse and hand back the current data so the client can merge ----
  const currentVersion = parseInt((await env.SCENEAGB_KV.get("site-version")) || "0", 10);
  if (baseVersion !== currentVersion) {
    const cur = async (k) => (await env.SCENEAGB_KV.get(k, "json")) || [];
    return new Response(JSON.stringify({
      conflict: true,
      version: currentVersion,
      packs: await cur("packs"),
      categories: await cur("categories"),
      exclusivePacks: await cur("exclusive-packs"),
      exclusiveCategories: await cur("exclusive-categories"),
    }), { status: 409, headers: { "Content-Type": "application/json" } });
  }

  if (!packs || !categories) {
    return new Response(JSON.stringify({ error: "packs and categories must be arrays" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // sanitise: keep only known fields, cap sizes
  const hashId = (s) => {
    let x = 5381;
    for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0;
    return "h" + x.toString(36);
  };
  const cleanPack = (p) => ({
    id: String(p.id || hashId((p.img || "") + "|" + (p.link || ""))).slice(0, 40),
    img: String(p.img || "").slice(0, 300),
    link: String(p.link || "").slice(0, 500),
    title: String(p.title || "").slice(0, 120),
    category: String(p.category || "").slice(0, 60),
    tags: (Array.isArray(p.tags) ? p.tags : []).slice(0, 10).map((t) => String(t).slice(0, 40)),
    also: (Array.isArray(p.also) ? p.also : []).slice(0, 10).map((a) => String(a).slice(0, 60)),
    res: String(p.res || "").slice(0, 20),
    size: String(p.size || "").slice(0, 20),
    added: Number(p.added) || 0,
  });
  const cleanPacks = packs.slice(0, 500).map(cleanPack).filter((p) => p.img && p.link);
  const cleanExclusivePacks = exclusivePacks.slice(0, 500).map(cleanPack).filter((p) => p.img && p.link);

  const cleanCats = (arr) => arr.slice(0, 50).map((c) => {
    if (typeof c === "string") return { id: "h" + c.slice(0, 30), name: c.slice(0, 60), img: "" };
    return {
      id: String(c.id || ("c-" + (c.name || ""))).slice(0, 70),
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
  const newVersion = currentVersion + 1;
  await env.SCENEAGB_KV.put("site-version", String(newVersion));

  return new Response(JSON.stringify({ ok: true, saved: cleanPacks.length, version: newVersion }), {
    headers: { "Content-Type": "application/json" },
  });
}
