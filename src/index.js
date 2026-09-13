// Pak Spotlight Worker — Cloudflare AI (primary)
var SUPABASE_URL = "https://supabase.co";
var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
var YOUTUBE_HANDLE = "@pkspotlight";
const DEFAULT_CATEGORIES = ["Serial / Series", "Long Play", "Comedy", "Shorts"];
async function getCategories(env) {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/thumbnails/config/categories.json?t=${Date.now()}`);
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) return list.map(x => String(x || "").trim()).filter(Boolean);
    }
  } catch {}
  return DEFAULT_CATEGORIES;
}
async function getFeaturedIds(env) {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/thumbnails/config/featured.json?t=${Date.now()}`);
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) return list.map(x => Number(x)).filter(n => !isNaN(n) && n > 0);
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
      if (data && typeof data === "object" && !Array.isArray(data)) { aiCacheMem = data; return aiCacheMem; }
    }
  } catch {}
  aiCacheMem = {}; return aiCacheMem;
}
async function saveAiCacheEntry(key, fields, authToken) {
  try {
    const cache = await getAiCache();
    cache[key] = { ...fields, _cachedAt: new Date().toISOString() };
    const keys = Object.keys(cache);
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete cache[k]);
    aiCacheMem = cache;
    if (!authToken) return;
    await fetch(AI_CACHE_SAVE_URL, { method: "POST", headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${authToken}`, "content-type": "application/json", "x-upsert": "true" }, body: JSON.stringify(cache) }).catch(() => {});
  } catch {}
}
function cacheKeyForTitle(title) {
  return String(title || "").toLowerCase().replace(/\s*\|\s*.*$/, "").replace(/\s*-\s*(ptv|pak spotlight|classic|full|drama|play).*$/i, "").replace(/\b(ep|episode|part|qist|his(sa|a)?)\s*\d+\b/gi, "").replace(/[^a-z0-9\u0600-\u06FF ]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
function parseEpisodeNumber(title, description) {
  const text = `${title || ""} ${description || ""}`;
  const m = text.match(/\b(?:ep|episode|part|qist|his+a?)\s*\.?\s*#?\s*(\d{1,3})\b/i) || String(title || "").match(/[(\[]\s*(\d{1,2})\s*[)\]]\s*$/) || String(title || "").match(/\s(\d{1,2})\s*$/);
  if (!m) return "";
  const n = Number(m); return n > 0 && n < 500 ? String(n) : "";
}
function cleanDramaTitle(title) {
  return String(title || "").replace(/\s*\|\s*.*$/, "").replace(/\s*-\s*(PTV|Pak Spotlight|Classic|Full|Drama|Play|HD).*$/i, "").replace(/\s*\b(Ep|Episode|Part|Qist|His+a?)\s*\.?\s*#?\s*\d+\b.*$/i, "").replace(/\s*[(\[]\s*\d{1,3}\s*[)\]]\s*$/i, "").replace(/\s*[-–—:]+\s*$/, "").replace(/\s+/g, " ").trim();
}
const CORS_HEADERS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type" };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS_HEADERS } }); }
function getBearer(request) { const h = request.headers.get("authorization") || ""; return h.startsWith("Bearer ") ? h.slice(7) : ""; }
async function requireUser(request) {
  const token = getBearer(request); if (!token) return { error: "Admin session required." };
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` } });
  if (!r.ok) return { error: "Your Admin session is not valid. Please log in again." };
  return { user: await r.json(), token };
}
function videoId(value) {
  try {
    const valStr = String(value || "").trim();
    if (valStr.includes("youtu.be")) return valStr.split("/").filter(Boolean).pop() || "";
    if (valStr.includes("youtube.com")) {
      const urlObj = new URL(valStr);
      if (urlObj.pathname === "/watch") return urlObj.searchParams.get("v") || "";
      if (urlObj.pathname.startsWith("/shorts/")) return urlObj.pathname.split("/") || "";
      if (urlObj.pathname.startsWith("/embed/")) return urlObj.pathname.split("/") || "";
    }
  } catch {}
  const m = String(value || "").match(/[A-Za-z0-9_-]{11}/); return m ? m : "";
}
async function youtubeJson(path, env) {
  if (!env.YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not configured in Cloudflare.");
  const u = new URL(`https://googleapis.com{path}`); u.searchParams.set("key", env.YOUTUBE_API_KEY);
  const r = await fetch(u), data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error?.message || "YouTube API request failed.");
  return data;
}
async function channelId(env) { try { const data = await youtubeJson(`channels?part=id&forHandle=${encodeURIComponent(YOUTUBE_HANDLE)}`, env); return data.items?.[0]?.id || ""; } catch { return ""; } }
async function identifyVideo(url, env) {
  const id = videoId(url); if (!id) throw new Error("Please enter a valid YouTube video URL.");
  const data = await youtubeJson(`videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}`, env);
  const item = data.items?.[0]; if (!item) throw new Error("YouTube video not found.");
  const thumbs = item.snippet?.thumbnails || {};
  const thumbnail = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || `https://ytimg.com{id}/hqdefault.jpg`;
  return { id: item.id, title: item.snippet?.title || "", description: item.snippet?.description || "", publishedAt: item.snippet?.publishedAt || "", channelId: item.snippet?.channelId || "", channelTitle: item.snippet?.channelTitle || "", thumbnail, duration: item.contentDetails?.duration || "" };
}
async function aiAutofill(video, env, opts = {}) {
  const allowedCategories = await getCategories(env), categoriesListStr = allowedCategories.join(", "), authToken = opts.authToken || "";
  const cleanedTitle = cleanDramaTitle(video.title), key = cacheKeyForTitle(video.title);
  if (!opts.skipCache && key) {
    try {
      const cache = await getAiCache(), hit = cache[key];
      if (hit && hit.title) {
        const ep = parseEpisodeNumber(video.title, video.description);
        return {
          video, cached: true, fields: {
            title: ep && hit.series_name ? `${hit.title.replace(/\s*\b(Ep|Episode|Part)\s*\d+.*$/i, "")} Ep ${ep}` : hit.title,
            urdu_title: hit.urdu_title || "", year: hit.year || String(video.publishedAt || "").slice(0, 4), type: hit.type || allowedCategories || "Long Play", series_name: hit.series_name || cleanedTitle, episode_number: ep || hit.episode_number || "", writer: hit.writer || "", director: hit.director || "", produced: hit.produced || "", cast: hit.cast || "", description: hit.description || String(video.description || "").slice(0, 500), seo_title: hit.seo_title || "", seo_description: hit.seo_description || "", thumbnail: video.thumbnail || ""
          }
        };
      }
    } catch {}
  }
  const desc = String(video.description || ""), sharedCredits = opts.sharedCredits || null, yearHint = String(video.publishedAt || "").slice(0, 4), epHint = parseEpisodeNumber(video.title, video.description);
  var prompt = "Pak Spotlight = archive of classic Pakistani PTV dramas.\nFill EVERY field below with your best answer from the YouTube info." + (sharedCredits ? " Credits already known, reuse them." : "") + " Never leave a field empty when you can infer it. Clean the title (remove EPISODE/PART numbers, | PTV, HD, etc). Urdu title: always give the Urdu script title. Year: use the drama's real release year; if unsure use " + (yearHint || "the upload year") + ". Episode: \"" + (epHint || "none seen") + "\". Series name: the drama serial name. Description: 2-3 warm sentences. Category: exactly one of: " + categoriesListStr + ".\nReturn ONLY a JSON object, no markdown. Keys: title, urdu_title, year, type, series_name, episode_number, writer, director, produced, cast, description.\n\nYouTube title: " + video.title + "\nYouTube description:\n" + desc.slice(0, 4000) + "\nUploaded: " + video.publishedAt;
  var rawContent = "";
  if (env.AI) {
    try {
      const cfResp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages: [{ role: "system", content: "Return ONLY valid JSON with ALL keys filled, best effort. Never add explanations." }, { role: "user", content: prompt }], temperature: 0.2, max_tokens: 1024 });
      rawContent = (cfResp?.result?.response || cfResp?.response || "").trim();
    } catch (cfErr) { console.warn("Cloudflare AI failed execution:", cfErr?.message || cfErr); }
  }
  if (!rawContent) throw new Error("Cloudflare AI failed to compute metadata. Please verify your Worker AI binding settings.");
  var out = {};
  try { out = JSON.parse(rawContent); } catch (e) {
    var codeBlockMatch = rawContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) try { out = JSON.parse(codeBlockMatch.trim()); } catch {}
    if (!out.title) {
      var braceStart = rawContent.indexOf("{"), braceEnd = rawContent.lastIndexOf("}");
      if (braceStart >= 0 && braceEnd > braceStart) try { out = JSON.parse(rawContent.slice(braceStart, braceEnd + 1)); } catch {}
    }
    if (!out.title) throw new Error("AI returned unreadable structure. Please try again.");
  }
