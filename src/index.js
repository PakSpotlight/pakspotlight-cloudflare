// Pak Spotlight Worker — Uses OpenRouter AI for auto-fill

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

var SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
var YOUTUBE_HANDLE = "@pkspotlight";
var OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
var DEFAULT_AI_MODEL = "deepseek/deepseek-v4-flash-0731";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization,content-type"
    }
  });
}
__name(json, "json");

function getBearer(request) {
  const h = request.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
__name(getBearer, "getBearer");

async function requireUser(request) {
  const token = getBearer(request);
  if (!token) return { error: "Admin session required." };
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: "Bearer " + token
    }
  });
  if (!r.ok) return { error: "Your Admin session is not valid. Please log in again." };
  return { user: await r.json(), token };
}
__name(requireUser, "requireUser");

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
__name(videoId, "videoId");

async function youtubeJson(path, env) {
  if (!env.YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not configured in Cloudflare.");
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  u.searchParams.set("key", env.YOUTUBE_API_KEY);
  const r = await fetch(u);
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error?.message || "YouTube API request failed.");
  return data;
}
__name(youtubeJson, "youtubeJson");

async function channelId(env) {
  const data = await youtubeJson("channels?part=id&forHandle=" + encodeURIComponent(YOUTUBE_HANDLE), env);
  return data.items?.[0]?.id || "";
}
__name(channelId, "channelId");

async function identifyVideo(url, env) {
  const id = videoId(url);
  if (!id) throw new Error("Please enter a valid YouTube video URL.");
  const data = await youtubeJson("videos?part=snippet,contentDetails&id=" + encodeURIComponent(id), env);
  const item = data.items?.[0];
  if (!item) throw new Error("YouTube video not found.");
  const expected = await channelId(env);
  if (expected && item.snippet?.channelId !== expected)
    throw new Error("That video is not from the Pak Spotlight YouTube channel.");
  return {
    id: item.id,
    title: item.snippet?.title || "",
    description: item.snippet?.description || "",
    publishedAt: item.snippet?.publishedAt || "",
    channelId: item.snippet?.channelId || "",
    channelTitle: item.snippet?.channelTitle || "",
    thumbnail: item.snippet?.thumbnails?.maxres?.url || item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.standard?.url || "",
    duration: item.contentDetails?.duration || ""
  };
}
__name(identifyVideo, "identifyVideo");

async function aiAutofill(video, env) {
  var apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured in Cloudflare Worker secrets.");
  var model = env.OPENROUTER_DEFAULT_MODEL || DEFAULT_AI_MODEL;

  var prompt =
    "You are preparing a catalog entry for Pak Spotlight, a Pakistani classic PTV drama archive.\n\n" +
    "You have web search available. Search ONCE for the drama title to find credits (writer, director, cast, year) if the YouTube metadata is incomplete.\n\n" +
    "From the YouTube metadata AND web search results, extract these fields. Only return facts — do not fabricate.\n\n" +
    "Choose category: Serial / Series, Long Play, Comedy, or Shorts.\n" +
    "Episode number: only if clearly indicated. Year: only if explicitly stated.\n\n" +
    "Generate SEO content:\n" +
    "- seo_title: Search-engine-friendly title (e.g. \"Drama Name (Year) - PTV Classic | Pak Spotlight\")\n" +
    "- seo_description: 150-160 char meta description summarizing the drama with key credits.\n\n" +
    "IMPORTANT: Return ONLY a valid JSON object, nothing else. No markdown, no explanation.\n" +
    "JSON fields: title, urdu_title, year, type, series_name, episode_number, writer, director, produced, cast, description, seo_title, seo_description.\n\n" +
    "YouTube title: " + video.title + "\n" +
    "YouTube description:\n" + video.description.slice(0, 12000) + "\n" +
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

  // Extract content from the response — handle tool call responses
  // OpenRouter may return multiple choices; check all of them
  if (data.choices) {
    for (var i = data.choices.length - 1; i >= 0; i--) {
      var choice = data.choices[i];
      var msg = choice?.message;
      if (!msg) continue;

      // Check direct content
      if (msg.content && msg.content.trim()) {
        rawContent = msg.content;
        break;
      }

      // Check tool_calls — the model may have returned the JSON as a tool call argument
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

  // If still no content, check choices array at top level (some providers put content there)
  if (!rawContent && data.choices?.length === 1) {
    rawContent = data.choices[0]?.message?.content || "";
  }

  if (!rawContent) {
    // Fallback: retry WITHOUT web search — the tool may have broken the response
    console.warn("AI returned empty content with web search. Retrying without tools...");
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

  // Extract JSON from the raw content
  rawContent = rawContent.trim();

  // Try direct parse first
  try {
    out = JSON.parse(rawContent);
  } catch (e) {
    // Try extracting from markdown code blocks
    var codeBlockMatch = rawContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try { out = JSON.parse(codeBlockMatch[1].trim()); } catch {}
    }

    // Try finding a JSON object in the text
    if (!out.title) {
      var braceStart = rawContent.indexOf("{");
      var braceEnd = rawContent.lastIndexOf("}");
      if (braceStart >= 0 && braceEnd > braceStart) {
        try { out = JSON.parse(rawContent.slice(braceStart, braceEnd + 1)); } catch {}
      }
    }

    // Last resort: if nothing parsed, throw with raw content for debugging
    if (!out.title) {
      console.error("All JSON parsing failed. Raw content:", rawContent.slice(0, 500));
      throw new Error("AI returned unreadable content. Please try again. Raw: " + rawContent.slice(0, 200));
    }
  }

  return {
    video: video,
    fields: {
      title: out.title || video.title,
      urdu_title: out.urdu_title || "",
      year: out.year || "",
      type: out.type || "Long Play",
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
__name(aiAutofill, "aiAutofill");

var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return json({}, 204);

    if (url.pathname === "/api/youtube-search" && request.method === "GET") {
      const auth = await requireUser(request);
      if (auth.error) return json({ error: auth.error }, 401);
      try {
        const q = url.searchParams.get("q")?.trim();
        if (!q) return json({ items: [] });
        const cid = await channelId(env);
        if (!cid) return json({ items: [] });
        const data = await youtubeJson(
          "search?part=snippet&channelId=" + encodeURIComponent(cid) + "&type=video&maxResults=10&q=" + encodeURIComponent(q),
          env
        );
        return json({
          items: (data.items || []).map(function (x) {
            return {
              id: x.id?.videoId,
              title: x.snippet?.title || "",
              description: x.snippet?.description || "",
              publishedAt: x.snippet?.publishedAt || "",
              thumbnail: x.snippet?.thumbnails?.medium?.url || x.snippet?.thumbnails?.high?.url || ""
            };
          })
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
        return json(await aiAutofill(video, env));
      } catch (e) {
        return json({ error: e.message || String(e) }, 400);
      }
    }

    return env.ASSETS.fetch(request);
  }
};

export { index_default as default };
