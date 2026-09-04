export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Explicit admin route: the browser app handles authentication, while
    // this header keeps the admin entry point out of search indexing.
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      const assetRequest = new Request(new URL("/index.html", request.url), request);
      const response = await env.ASSETS.fetch(assetRequest);
      const headers = new Headers(response.headers);
      headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    return env.ASSETS.fetch(request);
  }
};
