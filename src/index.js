// Pak Spotlight Worker — Cloudflare AI (Only)

var SUPABASE_URL = "https://supabase.co";
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

const ctxRef = { waitUntil: null };

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
  const u = new URL(`https://googleapis.com{path}`);
  u.searchParams.set("key", env.YOUTUBE_API_KEY);
  const r = await fetch(u);
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error?.message || "YouTube API request failed.");
  return data;
}

async function channelId(env) {
  try {
    const data = await youtubeJson(`channels?part=id&forHandle=${encodeURIComponent(YOUTUBE_HANDLE)}`, env);
    return data.items[0].id || "";
  } catch {
    return "";
  }
}

async function identifyVideo(url, env) {
  const id = videoId(url);
  if (!id) throw new Error("Please enter a valid YouTube video URL.");
  const data = await youtubeJson(`videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}`, env);
  const item = data.items[0];
  if (!item) throw new Error("YouTube video not found.");

  const thumbs = item.snippet?.thumbnails || {};
  const thumbnail = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || `https://ytimg.com{id}/hqdefault.jpg`;

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
    "Fill EVERY field below with your best answer from the YouTube info." +
    (sharedCredits ? " Credits already known, reuse them." : "") +
    " Never leave a field empty when you can infer it. Clean the title (remove EPISODE/PART numbers, | PTV, HD, etc). " +
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
      const cfResp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: "Return ONLY valid JSON with ALL keys filled, best effort. Never add explanations." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
