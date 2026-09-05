// Pak Spotlight Worker — Uses OpenRouter AI for auto-fill

var SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
var YOUTUBE_HANDLE = "@pkspotlight";
var OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
var DEFAULT_AI_MODEL = "deepseek/deepseek-v4-flash-0731";

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

  // Best available thumbnail
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

async function aiAutofill(video, env) {
  var apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured in Cloudflare Worker secrets.");
  var model = env.OPENROUTER_DEFAULT_MODEL || DEFAULT_AI_MODEL;
  const allowedCategories = await getCategories(env);
  const categoriesListStr = allowedCategories.join(", ");

  var prompt =
    "You are preparing a catalog entry for Pak Spotlight, a Pakistani classic PTV drama archive.\n\n" +
    "You have web search available. Search ONCE for the drama title to find credits (writer, director, cast, year) if the YouTube metadata is incomplete.\n\n" +
    "From the YouTube metadata AND web search results, extract these fields. Only return facts — do not fabricate.\n\n" +
    "Choose category: Exactly one of: " + categoriesListStr + ".\n" +
    "Episode number: only if clearly indicated. Year: only if explicitly stated.\n\n" +
    "Generate SEO content:\n" +
    "- seo_title: Search-engine-friendly title (e.g. \"Drama Name (Year) - PTV Classic | Pak Spotlight\")\n" +
    "- seo_description: 150-160 char meta description summarizing the drama with key credits.\n\n" +
    "IMPORTANT: Return ONLY a valid JSON object, nothing else. No markdown, no explanation.\n" +
    "JSON fields: title, urdu_title, year, type, series_name, episode_number, writer, director, produced, cast, description, seo_title, seo_description.\n\n" +
    "YouTube title: " + video.title + "\n" +
    "YouTube description:\n" + (video.description || "").slice(0, 12000) + "\n" +
    "Published date: " + video.publishedAt;

  var requestBody = {
    model: model,
    messages: [
      { role: "system", content: "Return ONLY valid JSON. Search the web once for drama credits if needed. Never fabricate facts." },
      { role: "user", content: prompt }
    ],
    tools: [{ type: "openrouter:web_search", max_results: 5, max_total_results: 5 }],
    temperature: 0
  };

  var response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://pakspotlight.com",
      "X-Title": "Pak Spotlight"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    var errData = {};
    try { errData = await response.json(); } catch {}
    throw new Error(errData.error?.message || "OpenRouter API request failed (" + response.status + ").");
  }

  var data = await response.json();
  var out = {};
  var rawContent = "";

  if (data.choices) {
    for (var i = data.choices.length - 1; i >= 0; i--) {
      var choice = data.choices[i];
      var msg = choice?.message;
      if (!msg) continue;

      if (msg.content && msg.content.trim()) {
        rawContent = msg.content;
        break;
      }

      if (msg.tool_calls) {
        for (var tc of msg.tool_calls) {
          var arg = tc?.function?.arguments;
          if (arg && arg.trim().startsWith("{")) {
            rawContent = arg;
            break;
          }
        }
        if (rawContent) break;
      }
    }
  }

  if (!rawContent && data.choices?.length === 1) {
    rawContent = data.choices[0]?.message?.content || "";
  }

  if (!rawContent) {
    delete requestBody.tools;
    var retryResp = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pakspotlight.com",
        "X-Title": "Pak Spotlight"
      },
      body: JSON.stringify(requestBody)
    });
    if (retryResp.ok) {
      var retryData = await retryResp.json();
      rawContent = retryData.choices?.[0]?.message?.content || "";
    }
  }

  rawContent = (rawContent || "").trim();

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
      throw new Error("AI returned unreadable content. Please try again. Raw: " + rawContent.slice(0, 200));
    }
  }

  return {
    video: video,
    fields: {
      title: out.title || video.title,
      urdu_title: out.urdu_title || "",
      year: out.year || "",
      type: (allowedCategories.find(c => c.toLowerCase() === String(out.type || "").trim().toLowerCase()) || (allowedCategories.includes(out.type) ? out.type : (allowedCategories[0] || "Long Play"))),
      series_name: out.series_name || "",
      episode_number: out.episode_number || "",
      writer: out.writer || "",
      director: out.director || "",
      produced: out.produced || "",
      cast: out.cast || "",
      description: out.description || video.description || "",
      seo_title: out.seo_title || "",
      seo_description: out.seo_description || "",
      thumbnail: video.thumbnail || ""
    }
  };
}

var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Pre-flight CORS support
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // Categories: Get Configured Categories
    if (url.pathname === "/api/categories" && request.method === "GET") {
      try {
        const categories = await getCategories(env);
        return json({ categories });
      } catch (e) {
        return json({ categories: DEFAULT_CATEGORIES });
      }
    }

    // Categories: Save (Admin authenticated)
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

    // 1. YouTube Search
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

    // 2. Identify Video from URL
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

    // 3. AI Auto-Fill metadata
    if (url.pathname === "/api/ai-autofill" && request.method === "POST") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const body = await request.json();
        const video = await identifyVideo(body.url, env);
        return json(await aiAutofill(video, env));
      } catch (e) {
        return json({ error: e.message || String(e) }, 400);
      }
    }

    // 4. Proxy YouTube Thumbnail to bypass browser CORS for canvas/blob upload
    if (url.pathname === "/api/proxy-thumbnail" && request.method === "GET") {
      try {
        let imageUrl = url.searchParams.get("url");
        const id = url.searchParams.get("id");
        if (!imageUrl && id) {
          imageUrl = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/maxresdefault.jpg`;
        }
        if (!imageUrl) return json({ error: "Missing url or id parameter." }, 400);

        let imgRes = await fetch(imageUrl);
        // Fallback to hqdefault if maxresdefault is 404 (common on older YouTube videos)
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
          headers: {
            "content-type": contentType,
            "cache-control": "public, max-age=86400",
            ...CORS_HEADERS
          }
        });
      } catch (e) {
        return json({ error: e.message || String(e) }, 500);
      }
    }

    // 5. Store Thumbnail directly to Supabase Storage Bucket
    if (url.pathname === "/api/store-thumbnail" && request.method === "POST") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const body = await request.json();
        const { dramaId, imageUrl } = body;
        if (!dramaId || !imageUrl) {
          return json({ error: "dramaId and imageUrl are required." }, 400);
        }

        // Fetch the image binary
        let imgRes = await fetch(imageUrl);
        if (!imgRes.ok && imageUrl.includes("maxresdefault.jpg")) {
          imgRes = await fetch(imageUrl.replace("maxresdefault.jpg", "hqdefault.jpg"));
        }
        if (!imgRes.ok) {
          return json({ error: "Failed to download image from YouTube." }, 502);
        }

        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        const imgBuffer = await imgRes.arrayBuffer();

        // Upload to Supabase Storage 'thumbnails' bucket
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

        // Update Drama record with the public thumbnail URL
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

    // Rewrite /watch to /index.html so clean watch URLs work directly
    if (url.pathname === "/watch") {
      const watchUrl = new URL(request.url);
      watchUrl.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(watchUrl, request));
    }

    // Static assets fallback
    return env.ASSETS.fetch(request);
  }
};

export { index_default as default };
