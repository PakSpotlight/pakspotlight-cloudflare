const SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
const SUPABASE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
const SITE_URL = "https://pak-spotlight.pakifun3.workers.dev";
const CHANNEL_HANDLE = "@pkspotlight";

function xmlEscape(value) { return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;"); }

async function sitemapResponse() {
  const urls = new Set([`${SITE_URL}/`]);
  try {
    const pageSize = 1000;
    for (let offset=0;;offset+=pageSize) {
      const endpoint=`${SUPABASE_URL}/rest/v1/Drama?select=id&order=id.asc&limit=${pageSize}&offset=${offset}`;
      const response=await fetch(endpoint,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`} });
      if(!response.ok) break;
      const rows=await response.json(); if(!Array.isArray(rows)||!rows.length) break;
      for(const row of rows) if(row?.id!=null) urls.add(`${SITE_URL}/?drama=${encodeURIComponent(String(row.id))}`);
      if(rows.length<pageSize) break;
    }
  } catch (_) {}
  const body=[...urls].map(url=>`  <url><loc>${xmlEscape(url)}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`,{headers:{"content-type":"application/xml; charset=UTF-8","cache-control":"public, max-age=300"}});
}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}})}
function corsResponse(res){return res}
function videoId(input){try{const u=new URL(input); if(u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0]; if(u.hostname.includes('youtube.com')) return u.searchParams.get('v') || (u.pathname.match(/\/shorts\/([^/]+)/)||[])[1] || (u.pathname.match(/\/embed\/([^/]+)/)||[])[1];}catch(_){} return null}
async function ytFetch(url,apiKey){const r=await fetch(url);if(!r.ok){let t='YouTube API request failed';try{const j=await r.json();t=j?.error?.message||t}catch(_){}throw new Error(t)}return r.json()}

async function youtubeSearch(request,env){
  if(!env.YOUTUBE_API_KEY) return json({error:'YOUTUBE_API_KEY secret is not available on this Worker.'},500);
  const q=new URL(request.url).searchParams.get('q')?.trim(); if(!q) return json({error:'Search query is required.'},400);
  const ch=await ytFetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(CHANNEL_HANDLE)}&key=${encodeURIComponent(env.YOUTUBE_API_KEY)}`,env.YOUTUBE_API_KEY);
  const channelId=ch.items?.[0]?.id; if(!channelId) return json({error:'Could not resolve the Pak Spotlight YouTube channel.'},404);
  const u=new URL('https://www.googleapis.com/youtube/v3/search'); u.searchParams.set('part','snippet');u.searchParams.set('channelId',channelId);u.searchParams.set('type','video');u.searchParams.set('maxResults','10');u.searchParams.set('q',q);u.searchParams.set('key',env.YOUTUBE_API_KEY);
  const data=await ytFetch(u,env.YOUTUBE_API_KEY);
  const items=(data.items||[]).map(x=>({id:x.id?.videoId,title:x.snippet?.title||'',description:x.snippet?.description||'',publishedAt:x.snippet?.publishedAt||'',url:`https://www.youtube.com/watch?v=${x.id?.videoId}`,thumbnail:x.snippet?.thumbnails?.high?.url||x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||''}));
  return json({items});
}

function baseFill(v){
  const text=`${v.title}\n${v.description}`;
  const out={title:v.title||'',urdu:'',year:'',type:'',series:'',episode:'',writer:'',director:'',produced:'',cast:'',description:v.description||'',youtube:v.url||'',thumbnail:v.thumbnail||''};
  const year=(text.match(/\b(19|20)\d{2}\b/)||[])[0]; if(year) out.year=year;
  const ep=(text.match(/(?:episode|ep\.?|e)\s*#?\s*(\d{1,3})\b/i)||[])[1]; if(ep) out.episode=ep;
  if(/long play|longplay/i.test(text)) out.type='Long Play'; else if(/telefilm/i.test(text)) out.type='Long Play'; else if(/comedy/i.test(text)) out.type='Comedy'; else if(/serial|episode|season/i.test(text)) out.type='Serial / Series';
  return out;
}
async function aiEnrich(v,env){
  if(!env.OPENAI_API_KEY) return {data:baseFill(v),aiUsed:false};
  const prompt=`You are a metadata assistant for a Pakistani classic PTV drama archive. Use ONLY information present in the supplied YouTube title and description. Never guess. Return JSON with exactly these keys: title, urdu, year, type, series, episode, writer, director, produced, cast, description. type must be one of: Serial / Series, Long Play, Comedy, Shorts, or empty. Keep unknown fields empty. Description should be a concise factual archive description based only on the supplied text.\nTITLE: ${v.title}\nDESCRIPTION: ${v.description}`;
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${env.OPENAI_API_KEY}`},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4o-mini',temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:'Return only valid JSON.'},{role:'user',content:prompt}]})});
  if(!r.ok) return {data:baseFill(v),aiUsed:false};
  const j=await r.json(); let parsed={}; try{parsed=JSON.parse(j.choices?.[0]?.message?.content||'{}')}catch(_){parsed={}};
  return {data:{...baseFill(v),...parsed,youtube:v.url,thumbnail:v.thumbnail},aiUsed:true};
}
async function identify(request,env){
  if(!env.YOUTUBE_API_KEY) return json({error:'YOUTUBE_API_KEY secret is not available on this Worker.'},500);
  const body=await request.json().catch(()=>({})); const id=videoId(body.url||''); if(!id) return json({error:'Please provide a valid YouTube video URL.'},400);
  const u=new URL('https://www.googleapis.com/youtube/v3/videos');u.searchParams.set('part','snippet,contentDetails');u.searchParams.set('id',id);u.searchParams.set('key',env.YOUTUBE_API_KEY);
  const j=await ytFetch(u,env.YOUTUBE_API_KEY); const item=j.items?.[0]; if(!item) return json({error:'YouTube video not found.'},404);
  const s=item.snippet||{}; const v={title:s.title||'',description:s.description||'',url:`https://www.youtube.com/watch?v=${id}`,thumbnail:s.thumbnails?.high?.url||s.thumbnails?.medium?.url||s.thumbnails?.default?.url||''};
  const result=await aiEnrich(v,env); return json(result);
}

export default { async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/sitemap.xml') return sitemapResponse();
  if(url.pathname==='/api/youtube-search' && request.method==='GET'){try{return await youtubeSearch(request,env)}catch(e){return json({error:e.message||'YouTube search failed.'},502)}}
  if(url.pathname==='/api/identify' && request.method==='POST'){try{return await identify(request,env)}catch(e){return json({error:e.message||'Identification failed.'},502)}}
  if(url.pathname==='/admin' || url.pathname==='/admin/'){const res=await env.ASSETS.fetch(new Request(new URL('/index.html',request.url),request));const h=new Headers(res.headers);h.set('X-Robots-Tag','noindex, nofollow, noarchive');return new Response(res.body,{status:res.status,headers:h})}
  return env.ASSETS.fetch(request);
}};
