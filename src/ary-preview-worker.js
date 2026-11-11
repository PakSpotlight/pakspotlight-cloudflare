const ALLOWED_PATHS = new Set(["/", "/ary-preview.html", "/css/admin.css", "/logo.png"]);

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    if (!ALLOWED_PATHS.has(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/") url.pathname = "/ary-preview.html";
    return env.ASSETS.fetch(new Request(url.toString(), request));
  }
};
