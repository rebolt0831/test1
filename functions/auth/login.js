// GET /auth/login?redirect=/exclusive/
// Kicks off the Discord OAuth flow.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const redirectAfter = url.searchParams.get("redirect") || "/exclusive/";

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.members.read",
    state: redirectAfter,
    prompt: "consent",
  });

  return Response.redirect(
    `https://discord.com/api/oauth2/authorize?${params.toString()}`,
    302
  );
}
