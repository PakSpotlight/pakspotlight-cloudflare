const SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
const SUPABASE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
const SITE_URL = "https://pak-spotlight.pakifun3.workers.dev";

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isSeries(row) {
  return ["Serial / Series", "Series", "Serial", "Comedy"].includes(String(row.type || ""));
}

async function sitemapResponse() {
  const urls = new Set([`${SITE_URL}/`]);
  try {
    const endpoint = `${SUPABASE_URL}/rest/v1/Drama?select=id,title,type,series_name,episode_number&order=id.asc`;
    const response = await fetch(endpoint, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (response.ok) {
      const rows = await response.json();
      const groups = new Set();
      for (const row of Array.isArray(rows) ? rows : []) {
        const series = isSeries(row) && String(row.series_name || "").trim();
        const key = series
          ? `series:${String(row.type).trim().toLowerCase()}:${String(series).trim().toLowerCase().replace(/\s+/g, " ")}`
          : `id:${row.id}`;
        if (groups.has(key)) continue;
        groups.add(key);
        if (row.id != null) urls.add(`${SITE_URL}/?drama=${encodeURIComponent(String(row.id))}`);
      }
    }
  } catch (_) {
    // Keep the homepage in the sitemap if the database cannot be reached.
  }

  const body = [...urls].map(url => `  <url><loc>${xmlEscape(url)}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`, {
    headers: { "content-type": "application/xml; charset=UTF-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/sitemap.xml") return sitemapResponse();
    return env.ASSETS.fetch(request);
  }
};
