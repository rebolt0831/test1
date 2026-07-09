// GET /api/exclusive-packs
// Only returns data if the session cookie proves the visitor holds an allowed Discord role.
// Edit the EXCLUSIVE_PACKS array below to add your own exclusive content.

import { verifySession, getCookie } from "../_lib/session.js";

const EXCLUSIVE_PACKS = [
  // {
  //   "img": "images/exclusive/example0.png",
  //   "link": "https://mega.nz/folder/XXXXXXXX#XXXXXXXXXXXXXXXXXXXXXX"
  // },
];

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);

  if (!payload || !payload.hasAccess) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(EXCLUSIVE_PACKS), {
    headers: { "Content-Type": "application/json" },
  });
}
