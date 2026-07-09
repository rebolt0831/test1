// GET /api/me
// Returns { loggedIn, username, hasAccess } based on the session cookie.

import { verifySession, getCookie } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);

  const body = payload
    ? {
        loggedIn: true,
        username: payload.username,
        hasAccess: !!payload.hasAccess,
        isAdmin: !!payload.isAdmin,
      }
    : { loggedIn: false };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
