export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      const asset = await env.ASSETS.fetch(new Request(new URL("/admin/index.html", request.url), request));
      const headers = new Headers(asset.headers);
      headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return new Response(asset.body, {status: asset.status, statusText: asset.statusText, headers});
    }
    return env.ASSETS.fetch(request);
  }
};
