// GET /api/admin/stats?days=7|30|90
// Team only (live-checked). Aggregates visits, pack views and downloads
// from Workers Analytics Engine. Needs CF_ACCOUNT_ID + CF_ANALYTICS_TOKEN.

import { verifySession, getCookie, isLiveAdmin } from "../../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, "session");
  const payload = await verifySession(token, env.SESSION_SECRET);
  if (!payload || !(await isLiveAdmin(payload, env))) {
    return json({ error: "forbidden" }, 403);
  }

  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) {
    return json({ error: "stats not configured — add CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN (see SETUP-GUIDE.md)" }, 501);
  }

  const url = new URL(request.url);
  let days = parseInt(url.searchParams.get("days") || "7", 10);
  if (![7, 30, 90].includes(days)) days = 7;

  const query = `
    SELECT blob1 AS type, blob2 AS pack, SUM(_sample_interval * double1) AS n
    FROM sceneagb_analytics
    WHERE timestamp > NOW() - INTERVAL '${days}' DAY
    GROUP BY type, pack
    FORMAT JSON
  `;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
      body: query,
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: "analytics query failed", detail: detail.slice(0, 300) }, 502);
  }

  const out = await res.json();
  const rows = out.data || [];

  let visits = 0, viewsTotal = 0, downloadsTotal = 0;
  const views = {}, downloads = {};

  for (const r of rows) {
    const n = Number(r.n) || 0;
    if (r.type === "visit") visits += n;
    if (r.type === "view") {
      viewsTotal += n;
      if (r.pack) views[r.pack] = (views[r.pack] || 0) + n;
    }
    if (r.type === "download") {
      downloadsTotal += n;
      if (r.pack) downloads[r.pack] = (downloads[r.pack] || 0) + n;
    }
  }

  const board = Object.keys(views)
    .map((pack) => ({ pack, views: views[pack], downloads: downloads[pack] || 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 15);

  // packs downloaded but never viewed in window still deserve a row
  Object.keys(downloads).forEach((pack) => {
    if (!board.find((b) => b.pack === pack) && board.length < 15) {
      board.push({ pack, views: views[pack] || 0, downloads: downloads[pack] });
    }
  });

  return json({ ok: true, days, visits, viewsTotal, downloadsTotal, board });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
