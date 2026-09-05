const SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
const YOUTUBE_HANDLE = "@pkspotlight";
const OPENAI_MODEL = "gpt-4o-mini";

function json(data, status=200){
  return new Response(JSON.stringify(data), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type"}});
}
function getBearer(request){
  const h=request.headers.get("authorization")||"";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
async function requireUser(request){
  const token=getBearer(request);
  if(!token) return {error:"Admin session required."};
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`, {headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`}});
  if(!r.ok) return {error:"Your Admin session is not valid. Please log in again."};
  return {user:await r.json(), token};
}
function videoId(value){
  try{
    const u=new URL(String(value||"").trim());
    if(u.hostname.includes("youtu.be")) return u.pathname.split("/").filter(Boolean)[0]||"";
    if(u.hostname.includes("youtube.com")){
      if(u.pathname==="/watch") return u.searchParams.get("v")||"";
      if(u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2]||"";
      if(u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2]||"";
    }
  }catch{}
  const m=String(value||"").match(/[A-Za-z0-9_-]{11}/);
  return m?m[0]:"";
}
async function youtubeJson(path, env){
  if(!env.YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not configured in Cloudflare.");
  const u=new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  u.searchParams.set("key",env.YOUTUBE_API_KEY);
  const r=await fetch(u);
  const data=await r.json();
  if(!r.ok || data.error) throw new Error(data.error?.message||"YouTube API request failed.");
  return data;
}
async function channelId(env){
  const data=await youtubeJson(`channels?part=id&forHandle=${encodeURIComponent(YOUTUBE_HANDLE)}`,env);
  return data.items?.[0]?.id||"";
}
async function identifyVideo(url, env){
  const id=videoId(url);
  if(!id) throw new Error("Please enter a valid YouTube video URL.");
  const data=await youtubeJson(`videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}`,env);
  const item=data.items?.[0];
  if(!item) throw new Error("YouTube video not found.");
  const expected=await channelId(env);
  if(expected && item.snippet?.channelId!==expected) throw new Error("That video is not from the Pak Spotlight YouTube channel.");
  return {id:item.id,title:item.snippet?.title||"",description:item.snippet?.description||"",publishedAt:item.snippet?.publishedAt||"",channelId:item.snippet?.channelId||"",channelTitle:item.snippet?.channelTitle||"",thumbnail:item.snippet?.thumbnails?.maxres?.url||item.snippet?.thumbnails?.high?.url||item.snippet?.thumbnails?.standard?.url||"",duration:item.contentDetails?.duration||""};
}
async function aiAutofill(video, env){
  if(!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured in Cloudflare.");
  const prompt=`You are preparing a catalog entry for Pak Spotlight, a Pakistani classic PTV drama archive.\n\nUse ONLY the supplied YouTube metadata. Do not invent facts. If writer, director, producer, cast, Urdu title, year, series name, or episode number is not clearly supported by the supplied metadata, return an empty string for that field.\n\nChoose category from exactly one of: Serial / Series, Long Play, Comedy, Shorts. Use the title/description to make a reasonable category classification, but leave factual credits blank when uncertain. For episode number, only return a number when clearly indicated (for example Episode 3, Ep 3, E03). For year, only return a year when explicitly present or unambiguously stated in the metadata.\n\nReturn JSON with these exact string fields: title, urdu_title, year, type, series_name, episode_number, writer, director, produced, cast, description. episode_number may be an empty string.\n\nYouTube title: ${video.title}\nYouTube description:\n${video.description.slice(0,12000)}\nPublished date: ${video.publishedAt}`;
  const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${env.OPENAI_API_KEY}`},body:JSON.stringify({model:OPENAI_MODEL,temperature:0,response_format:{type:"json_object"},messages:[{role:"system",content:"Return only valid JSON. Never fabricate credits or historical facts."},{role:"user",content:prompt}]})});
  const data=await r.json();
  if(!r.ok) throw new Error(data.error?.message||"OpenAI request failed.");
  let out={};
  try{out=JSON.parse(data.choices?.[0]?.message?.content||"{}");}catch{throw new Error("AI returned an invalid result. Please try again.");}
  return {video,fields:{title:out.title||video.title,urdu_title:out.urdu_title||"",year:out.year||"",type:out.type||"Long Play",series_name:out.series_name||"",episode_number:out.episode_number||"",writer:out.writer||"",director:out.director||"",produced:out.produced||"",cast:out.cast||"",description:out.description||video.description||""}};
}
export default {
  async fetch(request, env, ctx) {
    const url=new URL(request.url);
    if(request.method==="OPTIONS") return json({},204);
    if(url.pathname==="/api/youtube-search" && request.method==="GET"){
      const auth=await requireUser(request); if(auth.error) return json({error:auth.error},401);
      try{
        const q=url.searchParams.get("q")?.trim();
        if(!q) return json({items:[]});
        const cid=await channelId(env); if(!cid) return json({items:[]});
        const data=await youtubeJson(`search?part=snippet&channelId=${encodeURIComponent(cid)}&type=video&maxResults=10&q=${encodeURIComponent(q)}`,env);
        return json({items:(data.items||[]).map(x=>({id:x.id?.videoId,title:x.snippet?.title||"",description:x.snippet?.description||"",publishedAt:x.snippet?.publishedAt||"",thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.high?.url||""}))});
      }catch(e){return json({error:e.message||String(e)},500);}
    }
    if(url.pathname==="/api/identify" && request.method==="POST"){
      const auth=await requireUser(request); if(auth.error) return json({error:auth.error},401);
      try{const body=await request.json(); return json(await identifyVideo(body.url,env));}catch(e){return json({error:e.message||String(e)},400);}
    }
    if(url.pathname==="/api/ai-autofill" && request.method==="POST"){
      const auth=await requireUser(request); if(auth.error) return json({error:auth.error},401);
      try{const body=await request.json(); const video=await identifyVideo(body.url,env); return json(await aiAutofill(video,env));}catch(e){return json({error:e.message||String(e)},400);}
    }
    return env.ASSETS.fetch(request);
  }
};
