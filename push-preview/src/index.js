const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;
const TOKEN_PREFIX = "device:";

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

function titleKey(row) {
  const raw = String(row.series_name || row.title || "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\b(ep|episode|part|qist|hissa)\s*\.?\s*#?\s*\d+\b/gi, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase();
  return raw.slice(0, 120);
}

async function hash(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isExpoToken(value) {
  return typeof value === "string" &&
    /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,}\]$/.test(value);
}

async function readRows(env, filter = "", offset = 0) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/Drama`);
  url.searchParams.set("select", "id,title,series_name,episode_number,thumbnail_url");
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  if (filter) url.searchParams.set("id", filter);
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`Catalogue read failed: ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("Catalogue returned an invalid response");
  return rows;
}

async function registeredTokens(env) {
  const tokens = new Set();
  let cursor;
  do {
    const page = await env.PUSH_STORE.list({ prefix: TOKEN_PREFIX, cursor, limit: 1000 });
    for (const key of page.keys) {
      const item = await env.PUSH_STORE.get(key.name, "json");
      if (item && isExpoToken(item.token)) tokens.add(item.token);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return [...tokens];
}

async function sendNewDrama(env, row, tokens) {
  if (!tokens.length) return true;
  const name = String(row.series_name || row.title || "A new classic programme").slice(0, 120);
  const messages = tokens.map((to) => ({
    to,
    title: "New drama added",
    body: name,
    sound: "default",
    priority: "high",
    channelId: "new-dramas",
    ...(row.thumbnail_url ? { richContent: { image: row.thumbnail_url } } : {}),
    data: {
      type: "new_drama",
      dramaId: Number(row.id),
      url: `/drama/${Number(row.id)}`,
      title: name,
      image: row.thumbnail_url || ""
    }
  }));
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages.slice(i, i + 100))
    });
    if (!res.ok) return false;
    const result = await res.json();
    if (result?.data && result.data.some((ticket) => ticket.status === "error")) return false;
  }
  return true;
}

async function scheduledCheck(env) {
  let cursor = await env.PUSH_STORE.get("catalog_cursor");
  let known = await env.PUSH_STORE.get("known_series", "json");

  // First run only establishes a baseline. It never sends a burst of old-catalogue alerts.
  if (cursor === null || !Array.isArray(known)) {
    const seeded = new Set();
    let latestId = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const rows = await readRows(env, "", page * PAGE_SIZE);
      for (const row of rows) {
        const id = Number(row.id) || 0;
        if (id > latestId) latestId = id;
        const key = titleKey(row);
        if (key) seeded.add(key);
      }
      if (rows.length < PAGE_SIZE) break;
    }
    await env.PUSH_STORE.put("known_series", JSON.stringify([...seeded]));
    await env.PUSH_STORE.put("catalog_cursor", String(latestId));
    return;
  }

  const seen = new Set(known);
  let latestId = Number(cursor) || 0;
  const startCursor = latestId;
  const newRows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await readRows(env, `gt.${startCursor}`, page * PAGE_SIZE);
    if (!rows.length) break;
    for (const row of rows) {
      const id = Number(row.id) || 0;
      if (id <= latestId) continue;
      latestId = id;
      const key = titleKey(row);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      newRows.push(row);
    }
    if (rows.length < PAGE_SIZE) break;
  }

  if (!newRows.length) {
    await env.PUSH_STORE.put("catalog_cursor", String(latestId));
    return;
  }

  const tokens = await registeredTokens(env);
  for (const row of newRows) {
    const ok = await sendNewDrama(env, row, tokens);
    if (!ok) throw new Error("Push delivery failed; catalogue cursor was not advanced");
  }
  await env.PUSH_STORE.put("known_series", JSON.stringify([...seen]));
  await env.PUSH_STORE.put("catalog_cursor", String(latestId));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    }});
    if (url.pathname === "/health" && request.method === "GET") {
      return response({ ok: true, environment: env.PUSH_ENVIRONMENT || "preview" });
    }
    if (url.pathname === "/register" && request.method === "POST") {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 4096) return response({ error: "Request too large" }, 413);
      let body;
      try { body = await request.json(); } catch { return response({ error: "Invalid JSON" }, 400); }
      const token = body?.token;
      const installId = body?.installId;
      const platform = body?.platform;
      if (!isExpoToken(token) || typeof installId !== "string" || installId.length < 8 || installId.length > 160) {
        return response({ error: "A valid Expo push token and install ID are required" }, 400);
      }
      const id = await hash(installId);
      await env.PUSH_STORE.put(`${TOKEN_PREFIX}${id}`, JSON.stringify({
        token,
        platform: platform === "android" ? "android" : "unknown",
        updatedAt: new Date().toISOString()
      }));
      return response({ ok: true });
    }
    if (url.pathname === "/unregister" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return response({ error: "Invalid JSON" }, 400); }
      if (typeof body?.installId !== "string" || body.installId.length < 8 || body.installId.length > 160) {
        return response({ error: "A valid install ID is required" }, 400);
      }
      await env.PUSH_STORE.delete(`${TOKEN_PREFIX}${await hash(body.installId)}`);
      return response({ ok: true });
    }
    return response({ error: "Not found" }, 404);
  },

  async scheduled(_controller, env) {
    await scheduledCheck(env);
  }
};
