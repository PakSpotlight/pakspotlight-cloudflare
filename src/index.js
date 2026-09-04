const SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
const SUPABASE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
const SITE_URL = "https://pak-spotlight.pakifun3.workers.dev";

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function sitemapResponse() {
  const urls = new Set([`${SITE_URL}/`]);

  try {
    const endpoint =
      `${SUPABASE_URL}/rest/v1/Drama?select=id&order=id.asc`;

    const response = await fetch(endpoint, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (response.ok) {
      const rows = await response.json();

      for (const row of Array.isArray(rows) ? rows : []) {
        if (row.id != null) {
          urls.add(
            `${SITE_URL}/?drama=${encodeURIComponent(String(row.id))}`
          );
        }
      }
    }
  } catch (_) {
    // Keep homepage in sitemap if database is temporarily unavailable.
  }

  const body = [...urls]
    .map(
      (url) =>
        `  <url>\n    <loc>${xmlEscape(url)}</loc>\n  </url>`
    )
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${body}\n` +
      `</urlset>`,
    {
      headers: {
        "content-type": "application/xml; charset=UTF-8",
        "cache-control": "public, max-age=300",
      },
    }
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/sitemap.xml") {
      return sitemapResponse();
    }

    return env.ASSETS.fetch(request);
  },
};
