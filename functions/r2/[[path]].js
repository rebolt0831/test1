// GET /r2/<filename>
// Serves uploaded thumbnail images from the R2 bucket.
// Cached aggressively since uploads get unique timestamped names.

export async function onRequestGet({ params, env }) {
  if (!env.SCENEAGB_R2) {
    return new Response("Not found", { status: 404 });
  }

  const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.SCENEAGB_R2.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}
