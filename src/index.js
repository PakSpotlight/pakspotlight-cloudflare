const SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
const YOUTUBE_HANDLE = "@pkspotlight";
const OPENAI_MODEL = "gpt-4o-mini";

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
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured in Cloudflare.");

  const prompt = `You are a specialist cataloger and historian for Pak Spotlight, an archive of classic Pakistani Television (PTV) dramas, serials, and telefilms from the 1960s to 2000s.

Analyze the supplied YouTube title, description, and metadata. Extract and structure the information into valid JSON.

GUIDELINES:
1. "title": Clean English title of the drama or telefilm. Remove clutter like "Full Episode", "HD", "[Classic PTV Drama]", "Official Video", upload channel names, etc.
2. "urdu_title": Authentic Urdu title in proper Urdu script (e.g. آپا, دھوپ کنارے, وارث, ان کہی, آنگن ٹیڑھا, داستان حبیب, خدا کی بستی). If not mentioned or identifiable, leave empty string "".
3. "year": 4-digit release year (e.g. 1981, 1998). Only return when present or known for this classic drama; otherwise empty string.
4. "type": Exactly one of: "Serial / Series", "Long Play", "Comedy", "Shorts".
   - If it is a multi-episode drama, select "Serial / Series".
   - If it is a standalone telefilm or single-part drama, select "Long Play".
   - If it is lighthearted satire/sitcom, select "Comedy".
   - If under 15 minutes or a brief clip, select "Shorts".
5. "series_name": If it belongs to a series or serial, provide the clean series name (e.g. "Dhoop Kinare", "Nuskha Hazir Hai"). If standalone Long Play, leave empty string.
6. "episode_number": If this video is a specific episode (e.g. Ep 1, Episode 03), return the numeric integer (e.g. 1 or 3). Otherwise empty string "".
7. "writer": Playwright/writer (e.g. Ashfaq Ahmed, Bano Qudsia, Haseena Moin, Anwar Maqsood, Mumtaz Mufti, Amjad Islam Amjad).
8. "director": Director name (e.g. Sahira Kazmi, Yawar Hayat, Nusrat Thakur, Misbah Khalid).
9. "produced": Executive producer / PTV center (e.g. PTV Lahore, PTV Karachi, PTV Islamabad).
10. "cast": Comma-separated list of prominent actors/cast (e.g. "Arifa Siddiqui, Nabeel, Nighat Butt").
11. "description": A well-written, respectful 2-4 sentence summary/synopsis of the drama's story and heritage in English. Do not include subscribe links, channel links, or social media hashtags.

Return valid JSON with these exact keys:
{
  "title": string,
  "urdu_title": string,
  "year": string,
  "type": string,
  "series_name": string,
  "episode_number": string,
  "writer": string,
  "director": string,
  "produced": string,
  "cast": string,
  "description": string
}

YouTube Title: ${video.title}
YouTube Description:
${(video.description || "").slice(0, 12000)}
Published Date: ${video.publishedAt}`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are an expert archivist of classic Pakistani television. Output strictly valid JSON." },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "OpenAI request failed.");

  let out = {};
  try {
    out = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch {
    throw new Error("AI returned an invalid JSON response.");
  }

  return {
    video,
    fields: {
      title: out.title || video.title,
      urdu_title: out.urdu_title || "",
      year: out.year || "",
      type: ["Serial / Series", "Long Play", "Comedy", "Shorts"].includes(out.type) ? out.type : "Long Play",
      series_name: out.series_name || "",
      episode_number: out.episode_number || "",
      writer: out.writer || "",
      director: out.director || "",
      produced: out.produced || "",
      cast: out.cast || "",
      description: out.description || video.description || "",
      thumbnail: video.thumbnail || ""
    }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Pre-flight CORS support
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
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

    // Static assets fallback
    return env.ASSETS.fetch(request);
  }
};
