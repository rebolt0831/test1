// GET /api/exclusive-packs
// Returns { packs, categories } for the exclusive page.
//
// Access control, in order of preference:
//  1. LIVE CHECK (if DISCORD_BOT_TOKEN is set): asks Discord right now whether
//     this user currently holds a booster/admin role. Ex-boosters are locked out
//     immediately; new boosters get in without re-logging.
//  2. FALLBACK (no bot token): trusts the role snapshot stored in the login
//     session cookie (up to 7 days old).

import { verifySession, getCookie } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);

  if (!payload) {
    return json({ error: "not logged in" }, 401);
  }

  let allowed;

  if (env.DISCORD_BOT_TOKEN) {
    allowed = await liveRoleCheck(payload, env);
  } else {
    allowed = !!payload.hasExclusive;
  }

  if (!allowed) {
    return json({ error: "boosters only" }, 403);
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

async function liveRoleCheck(payload, env) {
  try {
    const r = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${payload.id}`,
      { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
    );

    if (r.status === 404) {
      // user is no longer in the server
      return false;
    }

    if (!r.ok) {
      // Discord hiccup (rate limit / outage) — fall back to the session flag
      // rather than locking legitimate boosters out.
      return !!payload.hasExclusive;
    }

    const member = await r.json();
    const roles = member.roles || [];
    const parse = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
    const exclusiveRoles = parse(env.DISCORD_EXCLUSIVE_ROLE_IDS);
    const adminRoles = parse(env.DISCORD_ADMIN_ROLE_IDS);

    return (
      roles.some((x) => exclusiveRoles.includes(x)) ||
      roles.some((x) => adminRoles.includes(x))
    );
  } catch (e) {
    return !!payload.hasExclusive;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
