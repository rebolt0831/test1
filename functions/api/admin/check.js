// GET /api/admin/check
// Live-verifies (via bot token when configured) that the current user
// still holds a team role. Used by the admin page on open, so removed
// team members hit the wall immediately instead of at session expiry.

import { verifySession, getCookie, isLiveAdmin } from "../../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);

  if (!payload) {
    return json({ ok: false, reason: "login" }, 401);
  }

  const admin = await isLiveAdmin(payload, env);
  if (!admin) {
    return json({ ok: false, reason: "role" }, 403);
  }

  return json({ ok: true, username: payload.username });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
