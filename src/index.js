// Pak Spotlight Worker — Cloudflare AI

var SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
var YOUTUBE_HANDLE = "@pkspotlight";

const DEFAULT_CATEGORIES = ["Serial / Series", "Long Play", "Comedy", "Shorts"];

async function getCategories(env) {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/thumbnails/config/categories.json?t=${Date.now()}`);
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        return list.map(x => String(x || "").trim()).filter(Boolean);
      }
    }
  } catch {}
  return DEFAULT_CATEGORIES;
}

async function getFeaturedIds(env) {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/thumbnails/config/featured.json?t=${Date.now()}`);
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        return list.map(x => Number(x)).filter(n => !isNaN(n) && n > 0);
      }
    }
  } catch {}
  return [];
}

const AI_CACHE_URL = `${SUPABASE_URL}/storage/v1/object/public/thumbnails/config/ai-cache.json`;
const AI_CACHE_SAVE_URL = `${SUPABASE_URL}/storage/v1/object/thumbnails/config/ai-cache.json`;

let aiCacheMem = null;

async function getAiCache() {
  if (aiCacheMem) return aiCacheMem;
  try {
    const res = await fetch(`${AI_CACHE_URL}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object" && !Array.isArray(data)) {
        aiCacheMem = data;
        return aiCacheMem;
      }
    }
  } catch {}
  aiCacheMem = {};
  return aiCacheMem;
}

async function saveAiCacheEntry(key, fields, authToken) {
  try {
    const cache = await getAiCache();
    cache[key] = { ...fields, _cachedAt: new Date().toISOString() };
    const keys = Object.keys(cache);
    if (keys.length > 300) {
      keys.slice(0, keys.length - 300).forEach(k => delete cache[k]);
    }
    aiCacheMem = cache;
    if (!authToken) return;
    await fetch(AI_CACHE_SAVE_URL, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${authToken}`,
        "content-type": "application/json",
        "x-upsert": "true"
      },
      body: JSON.stringify(cache)
    }).catch(() => {});
  } catch {}
}

function cacheKeyForTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*-\s*(ptv|pak spotlight|classic|full|drama|play).*$/i, "")
    .replace(/\b(ep|episode|part|qist|his(sa|a)?)\s*\d+\b/gi, "")
    .replace(/[^a-z0-9\u0600-\u06FF ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function parseEpisodeNumber(title, description) {
  const text = `${title || ""} ${description || ""}`;
  const m = text.match(/\b(?:ep|episode|part|qist|his+a?)\s*\.?\s*#?\s*(\d{1,3})\b/i)
    || String(title || "").match(/[(\[]\s*(\d{1,2})\s*[)\]]\s*$/)
    || String(title || "").match(/\s(\d{1,2})\s*$/);
  if (!m) return "";
  const n = Number(m[1]);
  return n > 0 && n < 500 ? String(n) : "";
}

function cleanDramaTitle(title) {
  return String(title || "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*-\s*(PTV|Pak Spotlight|Classic|Full|Drama|Play|HD).*$/i, "")
    .replace(/\s*\b(Ep|Episode|Part|Qist|His+a?)\s*\.?\s*#?\s*\d+\b.*$/i, "")
    .replace(/\s*[(\[]\s*\d{1,3}\s*[)\]]\s*$/i, "")
    .replace(/\s*[-–—:]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS
    }
  });
}

function getBearer(request) {
  const h = request.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

async function requireUser(request) {
  const token = getBearer(request);
  if (!token) return { error: "Admin session required." };
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`
    }
  });
  if (!r.ok) return { error: "Your Admin session is not valid. Please log in again." };
  return { user: await r.json(), token };
}

function videoId(value) {
  try {
    const u = new URL(String(value || "").trim());
    if (u.hostname.includes("youtu.be")) return u.pathname.split("/").filter(Boolean)[0] || "";
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v") || "";
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || "";
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || "";
    }
  } catch {}
  const m = String(value || "").match(/[A-Za-z0-9_-]{11}/);
  return m ? m[0] : "";
}

async function youtubeJson(path, env) {
  if (!env.YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not configured in Cloudflare.");
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  u.searchParams.set("key", env.YOUTUBE_API_KEY);
  const r = await fetch(u);
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error?.message || "YouTube API request failed.");
  return data;
}

async function channelId(env) {
  try {
    const data = await youtubeJson(`channels?part=id&forHandle=${encodeURIComponent(YOUTUBE_HANDLE)}`, env);
    return data.items?.[0]?.id || "";
  } catch {
    return "";
  }
}

async function identifyVideo(url, env) {
  const id = videoId(url);
  if (!id) throw new Error("Please enter a valid YouTube video URL.");
  const data = await youtubeJson(`videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}`, env);
  const item = data.items?.[0];
  if (!item) throw new Error("YouTube video not found.");

  const thumbs = item.snippet?.thumbnails || {};
  const thumbnail = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  return {
    id: item.id,
    title: item.snippet?.title || "",
    description: item.snippet?.description || "",
    publishedAt: item.snippet?.publishedAt || "",
    channelId: item.snippet?.channelId || "",
    channelTitle: item.snippet?.channelTitle || "",
    thumbnail,
    duration: item.contentDetails?.duration || ""
  };
}

async function aiAutofill(video, env, opts = {}) {
  const allowedCategories = await getCategories(env);
  const categoriesListStr = allowedCategories.join(", ");
  const authToken = opts.authToken || "";

  const cleanedTitle = cleanDramaTitle(video.title);
  const key = cacheKeyForTitle(video.title);

  if (!opts.skipCache && key) {
    try {
      const cache = await getAiCache();
      const hit = cache[key];
      if (hit && hit.title) {
        const ep = parseEpisodeNumber(video.title, video.description);
        return {
          video,
          cached: true,
          fields: {
            title: ep && hit.series_name ? `${hit.title.replace(/\s*\b(Ep|Episode|Part)\s*\d+.*$/i, "")} Ep ${ep}` : hit.title,
            urdu_title: hit.urdu_title || "",
            year: hit.year || String(video.publishedAt || "").slice(0, 4),
            type: hit.type || allowedCategories[0] || "Long Play",
            series_name: hit.series_name || cleanedTitle,
            episode_number: ep || hit.episode_number || "",
            writer: hit.writer || "",
            director: hit.director || "",
            produced: hit.produced || "",
            cast: hit.cast || "",
            description: hit.description || String(video.description || "").slice(0, 500),
            seo_title: hit.seo_title || "",
            seo_description: hit.seo_description || "",
            thumbnail: video.thumbnail || ""
          }
        };
      }
    } catch {}
  }

  const desc = String(video.description || "");
  const sharedCredits = opts.sharedCredits || null;

  const yearHint = String(video.publishedAt || "").slice(0, 4);
  const epHint = parseEpisodeNumber(video.title, video.description);

  var prompt =
    "Pak Spotlight = archive of classic Pakistani PTV dramas.\n" +
    "Fill EVERY field below with your best answer from the YouTube info."
    + (sharedCredits ? " Credits already known, reuse them." : "")
    + " Never leave a field empty when you can infer it. Clean the title (remove EPISODE/PART numbers, | PTV, HD, etc). " +
    "Urdu title: always give the Urdu script title (you know these classic dramas). " +
    "Year: use the drama's real release year; if unsure use " + (yearHint || "the upload year") + ". " +
    "Episode: \"" + (epHint || "none seen") + "\". Series name: the drama serial name (same as title for serials, empty for standalone long plays). " +
    "Description: 2-3 warm sentences for viewers, always filled. " +
    "Category: exactly one of: " + categoriesListStr + ".\n" +
    (sharedCredits ? "Known credits: " + JSON.stringify(sharedCredits) + "\n" : "") +
    "Return ONLY a JSON object, no markdown. Keys: title, urdu_title, year, type, series_name, episode_number, writer, director, produced, cast, description.\n\n" +
    "YouTube title: " + video.title + "\n" +
    "YouTube description:\n" + desc.slice(0, 4000) + "\n" +
    "Uploaded: " + video.publishedAt;

  var rawContent = "";
  var aiProvider = "";

  if (env.AI) {
    try {
      const cfResp = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: "You are a JSON-only API. Output ONLY a valid JSON object. No explanation, no markdown, no code fences. Just the raw JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 2048
      });
      rawContent = (cfResp?.result?.response || cfResp?.response || "").trim();
      if (rawContent) aiProvider = "cloudflare";
    } catch (cfErr) {
      console.warn("Cloudflare AI failed:", cfErr?.message || cfErr);
    }
  }

  if (!rawContent) {
    throw new Error("AI failed. Please try again.");
  }

  var out = {};
  try {
    out = JSON.parse(rawContent);
  } catch (e) {
    var codeBlockMatch = rawContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try { out = JSON.parse(codeBlockMatch[1].trim()); } catch {}
    }

    if (!out.title) {
      var braceStart = rawContent.indexOf("{");
      var braceEnd = rawContent.lastIndexOf("}");
      if (braceStart >= 0 && braceEnd > braceStart) {
        try { out = JSON.parse(rawContent.slice(braceStart, braceEnd + 1)); } catch {}
      }
    }

    if (!out.title) {
      throw new Error("AI returned unreadable content. Please try again.");
    }
  }

  const epFallback = parseEpisodeNumber(video.title, video.description);
  const yearFallback = String(video.publishedAt || "").slice(0, 4);
  const baseTitle = cleanDramaTitle(out.title || video.title);

  const fields = {
    title: baseTitle || video.title,
    urdu_title: out.urdu_title || "",
    year: out.year || yearFallback,
    type: (allowedCategories.find(c => c.toLowerCase() === String(out.type || "").trim().toLowerCase()) || (allowedCategories.includes(out.type) ? out.type : (allowedCategories[0] || "Long Play"))),
    series_name: out.series_name || (epFallback || /serial|series|ep|episode|part/i.test(video.title) ? baseTitle : ""),
    episode_number: out.episode_number || epFallback,
    writer: out.writer || sharedCredits?.writer || "",
    director: out.director || sharedCredits?.director || "",
    produced: out.produced || sharedCredits?.produced || "",
    cast: out.cast || sharedCredits?.cast || "",
    description: out.description || String(video.description || "").slice(0, 500),
    seo_title: "",
    seo_description: "",
    thumbnail: video.thumbnail || ""
  };
  fields.seo_title = `${fields.title}${fields.year ? ` (${fields.year})` : ""} - PTV Classic | Pak Spotlight`;
  fields.seo_description = `${fields.title} — classic PTV drama${fields.writer ? ` by ${fields.writer}` : ""}${fields.cast ? ` starring ${String(fields.cast).split(",").slice(0, 3).join(",")}` : ""}. Watch on Pak Spotlight.`.slice(0, 160);

  if (key && fields.title) {
    const cacheable = { ...fields };
    delete cacheable.thumbnail;
    delete cacheable.seo_title;
    delete cacheable.seo_description;
    if (ctxRef.waitUntil) {
      ctxRef.waitUntil(saveAiCacheEntry(key, cacheable, authToken));
    } else {
      saveAiCacheEntry(key, cacheable, authToken).catch(() => {});
    }
  }

  return { video, searched: false, provider: aiProvider, fields };
}

const ctxRef = { waitUntil: null };

function playlistIdFromUrl(value) {
  const s = String(value || "").trim();
  const clean = v => String(v || "").replace(/^['"\s]+|['"\s]+$/g, "").trim();
  try {
    const u = new URL(s);
    const p = clean(u.searchParams.get("list"));
    if (p) return p;
  } catch {}
  const m = s.match(/(?:^|[^A-Za-z0-9_-])(PL[A-Za-z0-9_-]{10,}|UU[A-Za-z0-9_-]{10,}|[A-Za-z0-9_-]{13,})(?:[^A-Za-z0-9_-]|$)/);
  return m ? clean(m[1]) : "";
}

async function fetchPlaylistMeta(playlistId, env) {
  const data = await youtubeJson(`playlists?part=snippet,contentDetails&id=${encodeURIComponent(playlistId)}`, env);
  const item = data.items?.[0];
  if (!item) throw new Error("Playlist not found. Check the link.");
  return {
    id: playlistId,
    title: item.snippet?.title || "Playlist",
    description: item.snippet?.description || "",
    count: item.contentDetails?.itemCount || 0,
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || ""
  };
}

async function fetchPlaylistItems(playlistId, env, max = 50) {
  const items = [];
  let pageToken = "";
  while (items.length < max) {
    const take = Math.min(50, max - items.length);
    let path = `playlistItems?part=snippet,contentDetails&maxResults=${take}&playlistId=${encodeURIComponent(playlistId)}`;
    if (pageToken) path += `&pageToken=${encodeURIComponent(pageToken)}`;
    const data = await youtubeJson(path, env);
    for (const it of data.items || []) {
      const vid = it.snippet?.resourceId?.videoId || it.contentDetails?.videoId || "";
      if (!vid) continue;
      const thumbs = it.snippet?.thumbnails || {};
      items.push({
        id: vid,
        title: it.snippet?.title || "",
        description: it.snippet?.description || "",
        publishedAt: it.snippet?.publishedAt || "",
        position: it.snippet?.position ?? items.length,
        thumbnail: thumbs.high?.url || thumbs.medium?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${vid}`
      });
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return items;
}

function supaRest(path, token, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
}

var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    ctxRef.waitUntil = ctx.waitUntil ? ctx.waitUntil.bind(ctx) : null;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/categories" && request.method === "GET") {
      try {
        const categories = await getCategories(env);
        return json({ categories });
      } catch (e) {
        return json({ categories: DEFAULT_CATEGORIES });
      }
    }

    if (url.pathname === "/api/categories" && request.method === "POST") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const body = await request.json();
        const incoming = body.categories;
        if (!Array.isArray(incoming) || incoming.length === 0) {
          return json({ error: "Categories must be a non-empty array." }, 400);
        }
        const cleaned = incoming.map(c => String(c || "").trim()).filter(Boolean);
        if (cleaned.length === 0) {
          return json({ error: "At least one valid category name is required." }, 400);
        }
        const storageUrl = `${SUPABASE_URL}/storage/v1/object/thumbnails/config/categories.json`;
        const upRes = await fetch(storageUrl, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${auth.token}`,
            "content-type": "application/json",
            "x-upsert": "true"
          },
          body: JSON.stringify(cleaned)
        });
        if (!upRes.ok) {
          const upErr = await upRes.text();
          return json({ error: `Failed to save categories to storage: ${upErr}` }, 500);
        }
        return json({ success: true, categories: cleaned });
      } catch (e) {
        return json({ error: e.message || String(e) }, 500);
      }
    }

    if (url.pathname === "/api/featured" && request.method === "GET") {
      try {
        const featuredIds = await getFeaturedIds(env);
        return json({ featuredIds });
      } catch (e) {
        return json({ featuredIds: [] });
      }
    }

    if (url.pathname === "/api/featured" && request.method === "POST") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const body = await request.json();
        const incoming = body.featuredIds;
        if (!Array.isArray(incoming)) {
          return json({ error: "featuredIds must be an array of numbers." }, 400);
        }
        const cleaned = incoming.map(x => Number(x)).filter(n => !isNaN(n) && n > 0);
        const storageUrl = `${SUPABASE_URL}/storage/v1/object/thumbnails/config/featured.json`;
        const upRes = await fetch(storageUrl, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${auth.token}`,
            "content-type": "application/json",
            "x-upsert": "true"
          },
          body: JSON.stringify(cleaned)
        });
        if (!upRes.ok) {
          const upErr = await upRes.text();
          return json({ error: `Failed to save featured list to storage: ${upErr}` }, 500);
        }
        return json({ success: true, featuredIds: cleaned });
      } catch (e) {
        return json({ error: e.message || String(e) }, 500);
      }
    }

    if (url.pathname === "/api/youtube-search" && request.method === "GET") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const q = url.searchParams.get("q")?.trim();
        if (!q) return json({ items: [] });
        const cid = await channelId(env);
        const channelParam = cid ? `&channelId=${encodeURIComponent(cid)}` : "";
        const data = await youtubeJson(`search?part=snippet${channelParam}&type=video&maxResults=12&q=${encodeURIComponent(q)}`, env);
        return json({
          items: (data.items || []).map(x => ({
            id: x.id?.videoId,
            title: x.snippet?.title || "",
            description: x.snippet?.description || "",
            publishedAt: x.snippet?.publishedAt || "",
            thumbnail: x.snippet?.thumbnails?.high?.url || x.snippet?.thumbnails?.medium?.url || ""
          }))
        });
      } catch (e) {
        return json({ error: e.message || String(e) }, 500);
      }
    }

    if (url.pathname === "/api/identify" && request.method === "POST") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const body = await request.json();
        return json(await identifyVideo(body.url, env));
      } catch (e) {
        return json({ error: e.message || String(e) }, 400);
      }
    }

    if (url.pathname === "/api/ai-autofill" && request.method === "POST") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const body = await request.json();
        const video = await identifyVideo(body.url, env);
        return json(await aiAutofill(video, env, {
          authToken: auth.token,
          forceSearch: body.forceSearch === true,
          skipSearch: body.skipSearch === true
        }));
      } catch (e) {
        return json({ error: e.message || String(e) }, 400);
      }
    }

    if (url.pathname === "/api/playlist-preview" && request.method === "POST") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const body = await request.json();
        const pid = playlistIdFromUrl(body.url || body.playlistId);
        if (!pid) return json({ error: "Paste a YouTube playlist link (with list=...)." }, 400);
        const meta = await fetchPlaylistMeta(pid, env);
        const items = await fetchPlaylistItems(pid, env, Math.min(Number(body.limit) || 50, 50));
        return json({
          playlist: meta,
          suggestedSeries: cleanDramaTitle(meta.title),
          items: items.map((it, i) => ({ ...it, episode: parseEpisodeNumber(it.title, "") || String(i + 1) }))
        });
      } catch (e) {
        return json({ error: e.message || String(e) }, 400);
      }
    }

    if (url.pathname === "/api/playlist-import" && request.method === "POST") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const body = await request.json();
        const pid = playlistIdFromUrl(body.url || body.playlistId);
        if (!pid) return json({ error: "Paste a YouTube playlist link (with list=...)." }, 400);
        const wantedIds = Array.isArray(body.videoIds) ? body.videoIds.map(String) : null;
        const limit = Math.min(Number(body.limit) || 50, 50);
        const meta = await fetchPlaylistMeta(pid, env);
        let items = await fetchPlaylistItems(pid, env, limit);
        if (wantedIds) items = items.filter(it => wantedIds.includes(it.id));
        if (items.length === 0) return json({ error: "No videos found in this playlist." }, 400);

        const seriesName = String(body.seriesName || "").trim() || cleanDramaTitle(meta.title);
        const category = String(body.category || "").trim();
        const allowedCategories = await getCategories(env);
        const type = allowedCategories.find(c => c.toLowerCase() === category.toLowerCase())
          || allowedCategories[0] || "Long Play";

        const given = body.credits && typeof body.credits === "object" ? body.credits : {};
        const needsAi = !String(given.writer || "").trim()
          || !String(given.director || "").trim()
          || !String(given.cast || "").trim()
          || !String(given.year || "").trim()
          || !String(given.urdu_title || "").trim();

        let shared = null;
        if (needsAi) {
          try {
            const first = await aiAutofill({
              id: items[0].id,
              title: items[0].title,
              description: items[0].description,
              publishedAt: items[0].publishedAt,
              thumbnail: items[0].thumbnail
            }, env, { authToken: auth.token, forceSearch: true });
            shared = {
              writer: first.fields.writer,
              director: first.fields.director,
              produced: first.fields.produced,
              cast: first.fields.cast,
              year: first.fields.year,
              urdu_title: first.fields.urdu_title,
              description: first.fields.description
            };
          } catch {}
        }

        const pick = (field) => String(given[field] || "").trim() || shared?.[field] || "";

        const results = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          try {
            const dupCheck = await supaRest(`Drama?select=id&youtube_url=eq.${encodeURIComponent(it.url)}`, auth.token);
            const dupData = await dupCheck.json().catch(() => []);
            if (Array.isArray(dupData) && dupData.length > 0) {
              results.push({ id: it.id, title: it.title, status: "skipped", note: "Already added" });
              continue;
            }
            const ep = parseEpisodeNumber(it.title, "") || String(i + 1);
            const title = cleanDramaTitle(it.title) || `${seriesName} Ep ${ep}`;
            const payload = {
              title,
              urdu_title: pick("urdu_title"),
              year: pick("year") || String(it.publishedAt || "").slice(0, 4),
              type,
              series_name: seriesName,
              episode_number: Number(ep) || null,
              writer: pick("writer"),
              director: pick("director"),
              produced: pick("produced"),
              cast: pick("cast"),
              description: (it.description || shared?.description || "").slice(0, 800),
              youtube_url: it.url,
              thumbnail_url: it.thumbnail || ""
            };
            const ins = await supaRest("Drama", auth.token, {
              method: "POST",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify(payload)
            });
            if (!ins.ok) {
              const t = await ins.text();
              results.push({ id: it.id, title: it.title, status: "error", note: t.slice(0, 160) });
              continue;
            }
            const row = await ins.json().catch(() => []);
            results.push({ id: it.id, title, status: "added", dramaId: row?.[0]?.id || null, episode: ep });
          } catch (e) {
            results.push({ id: it.id, title: it.title, status: "error", note: e.message || String(e) });
          }
        }

        const added = results.filter(r => r.status === "added").length;
        const skipped = results.filter(r => r.status === "skipped").length;
        return json({ success: true, series: seriesName, added, skipped, total: results.length, results });
      } catch (e) {
        return json({ error: e.message || String(e) }, 400);
      }
    }

    if (url.pathname === "/api/proxy-thumbnail" && request.method === "GET") {
      try {
        let imageUrl = url.searchParams.get("url");
        const id = url.searchParams.get("id");
        if (!imageUrl && id) {
          imageUrl = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/maxresdefault.jpg`;
        }
        if (!imageUrl) return json({ error: "Missing url or id parameter." }, 400);
        let imgRes = await fetch(imageUrl);
        if (!imgRes.ok && imageUrl.includes("maxresdefault.jpg")) {
          const fallbackUrl = imageUrl.replace("maxresdefault.jpg", "hqdefault.jpg");
          imgRes = await fetch(fallbackUrl);
        }
        if (!imgRes.ok) {
          return json({ error: `Failed to fetch image from source: ${imgRes.status}` }, 502);
        }
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        const bodyBuffer = await imgRes.arrayBuffer();
        return new Response(bodyBuffer, {
          status: 200,
          headers: { "content-type": contentType, "cache-control": "public, max-age=86400", ...CORS_HEADERS }
        });
      } catch (e) {
        return json({ error: e.message || String(e) }, 500);
      }
    }

    if (url.pathname === "/api/store-thumbnail" && request.method === "POST") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const body = await request.json();
        const { dramaId, imageUrl } = body;
        if (!dramaId || !imageUrl) {
          return json({ error: "dramaId and imageUrl are required." }, 400);
        }
        let imgRes = await fetch(imageUrl);
        if (!imgRes.ok && imageUrl.includes("maxresdefault.jpg")) {
          imgRes = await fetch(imageUrl.replace("maxresdefault.jpg", "hqdefault.jpg"));
        }
        if (!imgRes.ok) {
          return json({ error: "Failed to download image from YouTube." }, 502);
        }
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        const imgBuffer = await imgRes.arrayBuffer();
        const storagePath = `drama/${dramaId}.jpg`;
        const storageUrl = `${SUPABASE_URL}/storage/v1/object/thumbnails/${storagePath}`;
        const upRes = await fetch(storageUrl, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${auth.token}`,
            "content-type": contentType,
            "x-upsert": "true"
          },
          body: imgBuffer
        });
        if (!upRes.ok) {
          const upErr = await upRes.text();
          return json({ error: `Supabase Storage upload failed: ${upErr}` }, 500);
        }
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/thumbnails/${storagePath}?t=${Date.now()}`;
        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/Drama?id=eq.${dramaId}`, {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${auth.token}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({ thumbnail_url: publicUrl })
        });
        if (!patchRes.ok) {
          const patchErr = await patchRes.text();
          return json({ error: `Storage uploaded, but database update failed: ${patchErr}`, publicUrl }, 500);
        }
        return json({ success: true, publicUrl });
      } catch (e) {
        return json({ error: e.message || String(e) }, 500);
      }
    }

    if (url.pathname === "/watch") {
      const watchUrl = new URL(request.url);
      watchUrl.pathname = "/watch.html";
      return env.ASSETS.fetch(new Request(watchUrl, request));
    }

    if (url.pathname === "/browse") {
      const browseUrl = new URL(request.url);
      browseUrl.pathname = "/browse.html";
      return env.ASSETS.fetch(new Request(browseUrl, request));
    }

    return env.ASSETS.fetch(request);
  }
};

export { index_default as default };
