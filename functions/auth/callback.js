// GET /auth/callback?code=...&state=...
// Discord redirects here after the user approves the login.

import { signSession } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "/exclusive/";

  if (!code) {
    return Response.redirect(new URL("/", url).toString(), 302);
  }

  // 1. Exchange the code for an access token
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.DISCORD_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    return new Response("Discord authorization failed. Please try logging in again.", {
      status: 400,
    });
  }
  const tokenData = await tokenRes.json();

  // 2. Get the user's identity
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const user = await userRes.json();

  // 3. Check their roles in your server
  let hasAccess = false;
  let hasExclusive = false;
  let isAdmin = false;
  let inServer = false;
  const memberRes = await fetch(
    `https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );

  if (memberRes.ok) {
    inServer = true;
    const member = await memberRes.json();
    const roles = member.roles || [];
    const parse = (v) => (v || "").split(",").map((r) => r.trim()).filter(Boolean);
    const allowedRoles = parse(env.DISCORD_ALLOWED_ROLE_IDS);       // Verified -> Request
    const exclusiveRoles = parse(env.DISCORD_EXCLUSIVE_ROLE_IDS);   // Booster  -> Exclusive
    const adminRoles = parse(env.DISCORD_ADMIN_ROLE_IDS);           // Team     -> Admin
    hasAccess = roles.some((r) => allowedRoles.includes(r));
    hasExclusive = roles.some((r) => exclusiveRoles.includes(r));
    isAdmin = roles.some((r) => adminRoles.includes(r));
    if (isAdmin) { hasAccess = true; hasExclusive = true; } // team gets everything
  }

  // 4. Sign a session cookie
  const payload = {
    id: user.id,
    username: user.username,
    inServer,
    hasAccess,
    hasExclusive,
    isAdmin,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const token = await signSession(payload, env.SESSION_SECRET);

  const redirectTo = new URL(state, url).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectTo,
      "Set-Cookie": `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
    },
  });
}
