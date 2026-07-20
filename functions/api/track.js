// POST /api/track  { type: "visit" | "view" | "download", pack?: "pack title" }
// Fire-and-forget analytics beacon. Silently no-ops if the Analytics Engine
// binding isn't configured, so the site never breaks without it.

export async function onRequestPost({ request, env }) {
  if (!env.SCENEAGB_ANALYTICS) {
    return new Response(null, { status: 204 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(null, { status: 204 });
  }

  const type = ["visit", "view", "download"].includes(body.type) ? body.type : null;
  if (!type) return new Response(null, { status: 204 });

  const pack = String(body.pack || "").slice(0, 120);

  try {
    env.SCENEAGB_ANALYTICS.writeDataPoint({
      blobs: [type, pack],
      doubles: [1],
      indexes: [type],
    });
  } catch (e) {}

  return new Response(null, { status: 204 });
}
