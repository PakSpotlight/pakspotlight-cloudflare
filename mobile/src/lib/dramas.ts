/**
 * Drama archive model and the pure helpers that shape it.
 *
 * These are a deliberate port of the website's logic in `public/js/shared.js`
 * (mapRow, groupDramas, isSeries, cleanDramaTitle, parseEpisodeNumber, exportYouTubeId) so the
 * app groups series and parses titles exactly the way the site does. If the site's rules change,
 * change them here too — the two surfaces are expected to agree.
 */

export type Drama = {
  id: number;
  title: string;
  urdu: string;
  writer: string;
  director: string;
  cast: string;
  music: string;
  producer: string;
  episodes_count: number | null;
  youtube: string;
  image: string;
  type: string;
  is_series: boolean;
  series: string;
  episode: number | null;
  year: string;
  description: string;
};

export type RawRow = Record<string, unknown>;

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function normalize(s: unknown): string {
  return str(s).trim().toLowerCase();
}

export function cleanDescription(desc: unknown): string {
  if (!desc) return "";
  let d = str(desc);
  d = d.replace(/https?:\/\/[^\s]+/g, "");
  d = d.replace(
    /(?:Follow us on|Subscribe to|Like us on|Download our app|Visit our website|Copyright|All rights reserved)[\s\S]*/gi,
    ""
  );
  d = d.replace(/#\w+/g, "");
  d = d.replace(/\n\s*\n/g, "\n");
  d = d.replace(/^\s*[-•*]\s*/gm, "");
  d = d.trim();
  if (d.length > 320) {
    d = d.substring(0, 320).replace(/\s+\S*$/, "") + "…";
  }
  return d;
}

export function cleanDramaTitle(title: unknown): string {
  return str(title)
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*-\s*(PTV|Classic TV Pakistan|Classic|Full|Drama|Play|HD).*$/i, "")
    .replace(/\s*\b(Ep|Episode|Part|Qist|His+a?)\s*\.?\s*#?\s*\d+\b.*$/i, "")
    .replace(/\s*[(\[]\s*\d{1,3}\s*[)\]]\s*$/, "")
    .replace(/\s*[-–—:]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Zaib-Un-Nisa.." → "Zaib-Un-Nisa": trims the punctuation upload titles trail off with. */
export function tidyTitle(value: unknown): string {
  return str(value)
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:|/\\–—-]+$/, "")
    .trim();
}

/**
 * The name to print on a card or heading. Serials use the series name because individual rows
 * carry the raw YouTube upload title ("Zaib-Un-Nisa..", "Ep 12 | PTV"), exactly as the site does.
 */
export function displayTitle(d: Drama | null | undefined): string {
  if (!d) return "";
  const series = tidyTitle(d.series);
  if (isSeriesRecord(d) && series) return series;
  return tidyTitle(d.title) || series || "Untitled Drama";
}

export function parseEpisodeNumber(title: unknown, description?: unknown): number | null {
  const text = `${str(title)} ${str(description)}`;
  const m =
    text.match(/\b(?:ep|episode|part|qist|his+a?)\s*\.?\s*#?\s*(\d{1,3})\b/i) ||
    str(title).match(/[(\[]\s*(\d{1,2})\s*[)\]]\s*$/) ||
    str(title).match(/\s(\d{1,2})\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n < 500 ? n : null;
}

export function extractYouTubeId(url: unknown): string | null {
  if (!url) return null;
  const s = str(url).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return m ? m[1] : null;
}

/** Shape one Supabase `Drama` row the way every screen in the app expects it. */
export function mapRow(r: RawRow): Drama {
  const parsedEp =
    r.episode_number != null ? Number(r.episode_number) : r.episode != null ? Number(r.episode) : parseEpisodeNumber(r.title, r.description);
  const rawSeries = str(r.series_name || r.series).trim();
  const cleanedTitle = cleanDramaTitle(r.title);
  const isSerialType = ["serial / series", "series", "serial"].includes(normalize(r.type));
  const inferredSeries = rawSeries || (parsedEp || isSerialType ? cleanedTitle : "");

  return {
    id: Number(r.id),
    title: str(r.title) || "Untitled Drama",
    urdu: str(r.urdu_title || r.urdu),
    writer: str(r.writer),
    director: str(r.director),
    cast: str(r.cast || r.cast_members),
    music: str(r.music),
    producer: str(r.produced || r.producer),
    episodes_count: r.episodes_count ? Number(r.episodes_count) : null,
    youtube: str(r.youtube_url || r.youtube),
    image: str(r.thumbnail_url || r.image),
    type: str(r.type) || "Serial / Series",
    is_series: !!inferredSeries || isSerialType,
    series: inferredSeries,
    episode: parsedEp != null && !Number.isNaN(parsedEp) ? parsedEp : null,
    year: str(r.year),
    description: cleanDescription(r.description),
  };
}

/**
 * The same video is occasionally uploaded twice under different row ids. One copy is enough;
 * rows without a YouTube link are keyed by id so nothing else is dropped.
 */
function uniqueEpisodes(list: Drama[]): Drama[] {
  const seen = new Set<string>();
  const out: Drama[] = [];
  for (const ep of list) {
    const yt = extractYouTubeId(ep.youtube);
    const key = yt ? `yt:${yt}` : `id:${ep.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ep);
  }
  return out;
}

export function isSeriesRecord(d: Drama | null | undefined): boolean {
  if (!d) return false;
  return (
    !!str(d.series).trim() ||
    d.is_series === true ||
    ["serial / series", "series", "serial"].includes(normalize(d.type))
  );
}

/**
 * Group single rows into one card per series, episodes sorted oldest → newest.
 * The first entry of each group is the card the grids render.
 */
export function groupDramas(list: Drama[]): Drama[][] {
  const groups = new Map<string, Drama[]>();
  for (const d of list) {
    const isSer = isSeriesRecord(d) && !!str(d.series).trim();
    const key = isSer ? `series::${normalize(d.series)}` : `single::${d.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(d);
    else groups.set(key, [d]);
  }
  return Array.from(groups.values()).map((arr) => {
    arr.sort((a, b) => (a.episode == null ? 9999 : a.episode) - (b.episode == null ? 9999 : b.episode));
    const unique = uniqueEpisodes(arr);
    const rep = unique.find((x) => !!x.image) || unique[0];
    if (rep && !unique[0].image && rep.image) {
      unique[0] = { ...unique[0], image: rep.image };
    }
    return unique;
  });
}

/** The stable key a series (or standalone title) is identified by in My List and history. */
export function titleKey(d: Drama): string {
  const isSer = isSeriesRecord(d) && !!str(d.series).trim();
  return isSer ? `series::${normalize(d.series)}` : `single::${d.id}`;
}

export function seriesEpisodes(rows: Drama[], drama: Drama | null): Drama[] {
  if (!drama) return [];
  const isSer = isSeriesRecord(drama) && !!str(drama.series).trim();
  if (!isSer) return [drama];
  return uniqueEpisodes(
    rows
      .filter((x) => normalize(x.series) === normalize(drama.series))
      .sort((a, b) => (a.episode == null ? 9999 : a.episode) - (b.episode == null ? 9999 : b.episode))
  );
}

/** Where a "play this title" tap should land: the first playable episode of a serial. */
export function seriesStartId(rows: Drama[], drama: Drama | null): number | null {
  if (!drama) return null;
  const eps = seriesEpisodes(rows, drama);
  if (eps.length <= 1) return drama.id;
  const playable = eps.find((e) => extractYouTubeId(e.youtube)) || eps[0];
  return playable ? playable.id : drama.id;
}

export function recommendations(rows: Drama[], current: Drama | null, limit = 10): Drama[] {
  if (!current) return [];
  const currentKey = titleKey(current);
  const sameCategory = rows.filter((r) => titleKey(r) !== currentKey && r.type === current.type);
  return groupDramas(sameCategory)
    .slice(0, limit)
    .map((g) => g[0]);
}

/** Up to `limit` featured titles, falling back to the newest rich row when nothing is curated. */
export function heroPicks(rows: Drama[], featuredIds: number[], limit = 5): Drama[] {
  const picks: Drama[] = [];
  for (const id of featuredIds) {
    const d = rows.find((r) => r.id === id && r.image && r.title);
    if (d) picks.push(d);
    if (picks.length >= limit) break;
  }
  if (picks.length === 0) {
    const fallback = rows.find((r) => r.image && r.title && r.description) || rows[0];
    if (fallback) picks.push(fallback);
  }
  return picks;
}

export function episodesLabel(d: Drama, episodeCount: number): string {
  if (episodeCount > 1) return `${episodeCount} episodes`;
  if (episodeCount === 1) return "1 episode";
  if (d.episodes_count) return `${d.episodes_count} episodes`;
  return d.type;
}

/** "1984 · Romance · 26 episodes" — the meta line every card and detail hero uses. */
export function metaLine(d: Drama, parts: Array<string | number | null | undefined>): string {
  return parts
    .map((p) => (p === null || p === undefined ? "" : String(p).trim()))
    .filter(Boolean)
    .join(" · ");
}

export function prettyType(type: string): string {
  const t = normalize(type);
  if (t === "serial / series" || t === "series" || t === "serial") return "Drama serial";
  if (t === "long play") return "Long play";
  if (t === "shorts") return "Short";
  if (t === "comedy") return "Comedy";
  return type || "Drama";
}
