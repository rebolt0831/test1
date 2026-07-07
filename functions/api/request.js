// POST /api/request  { message: "..." }
// Requires login. Posts the request into a Discord channel via webhook.

import { verifySession, getCookie } from "../_lib/session.js";

export async function onRequestPost({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);

  if (!payload) {
    return new Response(JSON.stringify({ error: "not logged in" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = (body.message || "").trim().slice(0, 500);
  if (!message) {
    return new Response(JSON.stringify({ error: "empty message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!env.DISCORD_WEBHOOK_URL) {
    return new Response(JSON.stringify({ error: "webhook not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `**New scenepack request** from **${payload.username}**:\n${message}`,
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
