// POST /api/request  (multipart form: title, message?, files[] up to 3 images)
// Requires the Verified role. Forwards to a Discord channel webhook,
// including any attached images.

import { verifySession, getCookie } from "../_lib/session.js";

const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function onRequestPost({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);

  if (!payload) {
    return json({ error: "not logged in" }, 401);
  }
  if (!payload.hasAccess) {
    return json({ error: "verified members only" }, 403);
  }
  if (!env.DISCORD_WEBHOOK_URL) {
    return json({ error: "webhook not configured" }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json({ error: "bad request" }, 400);
  }

  const title = String(form.get("title") || "").trim().slice(0, 100);
  const message = String(form.get("message") || "").trim().slice(0, 500);
  if (!title) {
    return json({ error: "title required" }, 400);
  }

  const files = form.getAll("files").filter((f) => f && typeof f !== "string").slice(0, MAX_FILES);
  for (const f of files) {
    if (!ALLOWED.includes(f.type)) return json({ error: "only image attachments are allowed" }, 400);
    if (f.size > MAX_BYTES) return json({ error: "images must be under 5 MB" }, 400);
  }

  // Works with BOTH channel types automatically:
  //  - forum channel webhook: creates a new post titled after the request
  //  - normal text channel webhook: sends a regular message
  const buildForm = (forumMode) => {
    let content;
    const body = {};
    if (forumMode) {
      body.thread_name = title;                       // becomes the forum post title
      content = `**Request** from **${payload.username}**`;
      if (message) content += `\n${message}`;
    } else {
      content = `**New scenepack request** from **${payload.username}**\n**${title}**`;
      if (message) content += `\n${message}`;
    }
    body.content = content;
    const out = new FormData();
    out.append("payload_json", JSON.stringify(body));
    files.forEach((f, i) => out.append(`files[${i}]`, f, f.name || `image${i}.png`));
    return out;
  };

  // try as a forum post first; if the webhook is on a normal channel,
  // Discord rejects thread_name and we retry as a plain message
  let hookRes = await fetch(env.DISCORD_WEBHOOK_URL, { method: "POST", body: buildForm(true) });
  if (!hookRes.ok) {
    hookRes = await fetch(env.DISCORD_WEBHOOK_URL, { method: "POST", body: buildForm(false) });
  }
  if (!hookRes.ok) {
    return json({ error: "discord rejected the message — try smaller images" }, 502);
  }

  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
