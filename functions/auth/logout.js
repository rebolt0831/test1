// GET /auth/logout

export async function onRequestGet({ request }) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL("/", request.url).toString(),
      "Set-Cookie": "session=; Path=/; Max-Age=0",
    },
  });
}
