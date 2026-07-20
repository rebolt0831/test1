// Shared helpers for signing/reading the login session cookie.
// Uses the Web Crypto API (available natively in Cloudflare Workers/Pages Functions).

async function getKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64(str) {
  return decodeURIComponent(escape(atob(str)));
}

export async function signSession(payload, secret) {
  const key = await getKey(secret);
  const body = toBase64(JSON.stringify(payload));
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${body}.${sig}`;
}

export async function verifySession(token, secret) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  try {
    const key = await getKey(secret);
    const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(body)
    );
    if (!valid) return null;

    const payload = JSON.parse(fromBase64(body));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}


// Live admin check: verifies against Discord in real time when a bot token is
// configured; otherwise falls back to the role snapshot in the session.
export async function isLiveAdmin(payload, env) {
  if (!payload) return false;
  if (!env.DISCORD_BOT_TOKEN) return !!payload.isAdmin;

  try {
    const r = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${payload.id}`,
      { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
    );

    if (r.status === 404) return false; // left the server

    if (!r.ok) {
      // Discord hiccup — fall back to the session rather than locking the team out
      return !!payload.isAdmin;
    }

    const member = await r.json();
    const roles = member.roles || [];
    const adminRoles = (env.DISCORD_ADMIN_ROLE_IDS || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    return roles.some((x) => adminRoles.includes(x));
  } catch (e) {
    return !!payload.isAdmin;
  }
}
