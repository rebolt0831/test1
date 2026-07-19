// POST /api/admin/upload  (multipart form with a "file" field)
// Admin only. Stores the image in the R2 bucket bound as SCENEAGB_R2
// and returns { ok, path } where path is like "r2/1720000000-my-image.png".
// If R2 isn't configured, returns a clear error and nothing breaks —
// admins can still type image paths/URLs manually.

import { verifySession, getCookie, isLiveAdmin } from "../../_lib/session.js";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function onRequestPost({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);

  if (!payload || !(await isLiveAdmin(payload, env))) {
    return json({ error: "forbidden" }, 403);
  }

  if (!env.SCENEAGB_R2) {
    return json(
      { error: "Image uploads aren't set up yet — create an R2 bucket and bind it as SCENEAGB_R2 (see SETUP.md). You can still paste an image path manually." },
      501
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json({ error: "expected multipart form data" }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return json({ error: "no file provided" }, 400);
  }

  if (!ALLOWED.includes(file.type)) {
    return json({ error: "only png, jpg, gif or webp images are allowed" }, 400);
  }

  if (file.size > MAX_BYTES) {
    return json({ error: "image too large — keep thumbnails under 4 MB" }, 400);
  }

  // safe unique key: timestamp + cleaned filename
  const cleanName = (file.name || "image")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 80);
  const key = `${Date.now()}-${cleanName}`;

  await env.SCENEAGB_R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return json({ ok: true, path: `r2/${key}` });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
