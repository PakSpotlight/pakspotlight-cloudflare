/**
 * Pak Spotlight — Shared JavaScript Utilities & API Layer
 */

const SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";

// Initialize Supabase Client
var sbClient = (window.supabase && typeof window.supabase.createClient === "function")
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
window.sbClient = sbClient;


// DOM helper
const $ = id => document.getElementById(id);

// Safe HTML escape
function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanDescription(desc) {
  if (!desc) return "";
  let d = String(desc);
  d = d.replace(/https?:\/\/[^\s]+/g, "");
  d = d.replace(/(?:Follow us on|Subscribe to|Like us on|Download our app|Visit our website|Copyright|All rights reserved)[\s\S]*/gi, "");
  d = d.replace(/#\w+/g, "");
  d = d.replace(/\n\s*\n/g, "\n");
  d = d.replace(/^\s*[-•*]\s*/gm, "");
  d = d.trim();
  if (d.length > 320) {
    d = d.substring(0, 320).replace(/\s+\S*$/, "") + "…";
  }
  return d;
}

function sanitizeId(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "-");
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function cleanDramaTitle(title) {
  return String(title || "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*-\s*(PTV|Pak Spotlight|Classic|Full|Drama|Play|HD).*$/i, "")
    .replace(/\s*\b(Ep|Episode|Part|Qist|His+a?)\s*\.?\s*#?\s*\d+\b.*$/i, "")
    .replace(/\s*[(\[]\s*\d{1,3}\s*[)\]]\s*$/, "")
    .replace(/\s*[-–—:]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEpisodeNumber(title, description) {
  const text = `${title || ""} ${description || ""}`;
  const m = text.match(/\b(?:ep|episode|part|qist|his+a?)\s*\.?\s*#?\s*(\d{1,3})\b/i)
    || String(title || "").match(/[(\[]\s*(\d{1,2})\s*[)\]]\s*$/)
    || String(title || "").match(/\s(\d{1,2})\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n < 500 ? n : null;
}

function isSeries(d) {
  if (!d) return false;
  return !!String(d.series || "").trim() ||
    d.is_series === true || d.is_series === 1 || String(d.is_series).toLowerCase() === "true" ||
    ["serial / series", "series", "serial"].includes(String(d.type || "").toLowerCase().trim());
}

function extractYouTubeId(url) {
  if (!url) return null;
  const str = String(url).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const m = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return m ? m[1] : null;
}

function mapRow(r) {
  const parsedEp = r.episode_number != null ? Number(r.episode_number) : (r.episode != null ? Number(r.episode) : parseEpisodeNumber(r.title));
  const rawSeries = (r.series_name || r.series || "").trim();
  const cleanedTitle = cleanDramaTitle(r.title);
  const isSerialType = ["serial / series", "series", "serial"].includes(String(r.type || "").toLowerCase().trim());
  const inferredSeries = rawSeries || (parsedEp || isSerialType ? cleanedTitle : "");

  return {
    id: r.id,
    title: r.title || "Untitled Drama",
    urdu: r.urdu_title || r.urdu || "",
    writer: r.writer || "",
    director: r.director || "",
    cast: r.cast || r.cast_members || "",
    music: r.music || "",
    producer: r.produced || r.producer || "",
    episodes_count: r.episodes_count || null,
    youtube: r.youtube_url || r.youtube || "",
    image: r.thumbnail_url || r.image || "",
    type: r.type || "Serial / Series",
    is_series: !!inferredSeries || isSerialType,
    series: inferredSeries,
    episode: parsedEp,
    year: r.year || "",
    description: r.description || ""
  };
}

// Group episodes by Series name so full series show as 1 clean poster card on home/browse
function groupDramas(list) {
  const groups = new Map();
  for (const d of list) {
    const isSer = isSeries(d) && !!String(d.series || "").trim();
    const key = isSer ? `series::${normalize(d.series)}` : `single::${d.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return Array.from(groups.values()).map(arr => {
    arr.sort((a, b) => (a.episode ?? 9999) - (b.episode ?? 9999));
    const rep = arr.find(x => !!x.image) || arr[0];
    if (rep && !arr[0].image && rep.image) {
      arr[0] = { ...arr[0], image: rep.image };
    }
    return arr;
  });
}

// Global state
let rows = [];
let categories = ["Serial / Series", "Long Play", "Comedy", "Shorts"];
let featuredIds = [];

// Data Loading with caching
async function loadCategories() {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/thumbnails/config/categories.json?t=${Date.now()}`);
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        categories = list.map(x => String(x || "").trim()).filter(Boolean);
      }
    }
  } catch (e) {
    console.warn("Could not load categories.json, using defaults:", e);
  }
  return categories;
}

async function loadData() {
  const CACHE_KEY = "pak_spotlight_dramas_cache";
  const CACHE_TIME_KEY = "pak_spotlight_dramas_cache_time";
  const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

  console.log("🎬 loadData() starting...");
  console.log("SUPABASE_URL:", SUPABASE_URL);
  console.log("SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? "✓ defined" : "✗ undefined");

  try {
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (cachedRaw && cachedTime && (Date.now() - Number(cachedTime) < CACHE_TTL)) {
      const parsed = JSON.parse(cachedRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log("📦 Using cached data, rows:", parsed.length);
        rows = parsed.map(mapRow);
      }
    }
  } catch {}

  try {
    const dramUrl = `${SUPABASE_URL}/rest/v1/Drama?select=*&order=id.desc`;
    console.log("📡 Fetching Drama table from:", dramUrl);
    
    const [dramaRes, featRes] = await Promise.all([
      fetch(dramUrl, {
        headers: {
          apikey: SUPABASE_ANON_KEY
        }
      }),
      fetch(`${SUPABASE_URL}/storage/v1/object/public/thumbnails/config/featured.json?t=${Date.now()}`).catch(() => null)
    ]);

    console.log("📊 Drama response status:", dramaRes.status, dramaRes.statusText);

    if (dramaRes.ok) {
      const data = await dramaRes.json();
      console.log("✅ Successfully loaded Drama data, count:", data.length);
      rows = (data || []).map(mapRow);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
      } catch {}
    } else {
      const errText = await dramaRes.text();
      console.error("❌ Drama fetch failed:", dramaRes.status, errText);
    }

    if (featRes && featRes.ok) {
      const featList = await featRes.json();
      if (Array.isArray(featList)) {
        featuredIds = featList.map(Number).filter(n => !isNaN(n) && n > 0);
      }
    }
  } catch (err) {
    console.error("❌ Error fetching dramas from Supabase:", err);
  }

  console.log("🎬 loadData() finished. Rows loaded:", rows.length);
  return rows;
}

function getDramaById(id) {
  return rows.find(r => r.id === Number(id));
}

function heroPick() {
  for (const id of featuredIds) {
    const d = rows.find(r => r.id === id && r.image && r.title);
    if (d) return d;
  }
  return rows.find(r => r.image && r.title && r.description) || rows[0] || {};
}

function scrollCarousel(rowId, direction) {
  const track = document.getElementById("track-" + rowId);
  if (track) {
    const scrollAmount = 600 * direction;
    track.scrollBy({ left: scrollAmount, behavior: "smooth" });
  }
}


function getDramaSeriesEpisodes(drama) {
  if (!drama) return [];
  const isSer = isSeries(drama) && !!String(drama.series || "").trim();
  if (!isSer) return [drama];
  return rows
    .filter(x => normalize(x.series) === normalize(drama.series))
    .sort((a, b) => (a.episode ?? 9999) - (b.episode ?? 9999));
}

// Where a "play this title" link should land: episode 1 of a serial
// (first playable one), or the title itself for standalone videos.
function seriesStartId(drama) {
  if (!drama) return null;
  const eps = getDramaSeriesEpisodes(drama);
  if (eps.length <= 1) return drama.id;
  return (eps.find(e => extractYouTubeId(e.youtube)) || eps[0]).id;
}

function getRecommendations(currentDrama, limit = 10) {
  if (!currentDrama) return [];
  const currentKey = isSeries(currentDrama) ? normalize(currentDrama.series) : String(currentDrama.id);
  const sameCategory = rows.filter(r => {
    const k = isSeries(r) ? normalize(r.series) : String(r.id);
    return k !== currentKey && r.type === currentDrama.type;
  });
  const groups = groupDramas(sameCategory);
  return groups.slice(0, limit).map(g => g[0]);
}

// ----------------------
// MY LIST (LOCAL STORAGE)
// ----------------------
function getMyList() {
  try {
    const list = JSON.parse(localStorage.getItem("pak_spotlight_mylist") || "[]");
    return Array.isArray(list) ? list.map(Number).filter(n => !isNaN(n) && n > 0) : [];
  } catch {
    return [];
  }
}

function isInMyList(id) {
  const list = getMyList();
  return list.includes(Number(id));
}

function toggleMyList(id) {
  const numId = Number(id);
  let list = getMyList();
  let added = false;
  if (list.includes(numId)) {
    list = list.filter(x => x !== numId);
    showToast("Removed from My List");
  } else {
    list.unshift(numId);
    showToast("Added to My List");
    added = true;
  }
  try {
    localStorage.setItem("pak_spotlight_mylist", JSON.stringify(list));
  } catch {}
  return added;
}

// ----------------------
// TOAST NOTIFICATIONS
// ----------------------
let toastTimeout = null;
function showToast(msg) {
  let el = $("toastNotice");
  if (!el) {
    el = document.createElement("div");
    el.id = "toastNotice";
    el.className = "toast-notice";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    el.classList.remove("show");
  }, 2200);
}

// ----------------------
// MOBILE DRAWER & SEARCH
// ----------------------
function toggleMobileDrawer(open) {
  const drawer = $("mobileDrawer");
  const backdrop = $("mobileDrawerBackdrop");
  if (!drawer || !backdrop) return;
  if (open) {
    drawer.classList.add("open");
    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
  } else {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
  }
}

function openMobileSearch() {
  const modal = $("mobileSearchModal");
  if (!modal) return;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    const input = $("mobileSearchInput");
    if (input) input.focus();
  }, 50);
}

function closeMobileSearch() {
  const modal = $("mobileSearchModal");
  if (!modal) return;
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

function clearMobileSearch() {
  const input = $("mobileSearchInput");
  if (input) {
    input.value = "";
    handleMobileSearchInput();
    input.focus();
  }
}

function handleMobileSearchInput() {
  const input = $("mobileSearchInput");
  const clearBtn = $("mSearchClear");
  const resultsBox = $("mSearchResults");
  if (!input || !resultsBox) return;

  const q = input.value.trim().toLowerCase();
  if (clearBtn) clearBtn.style.display = q ? "block" : "none";

  if (!q) {
    resultsBox.innerHTML = `
      <div class="m-search-prompt">
        <span>🔍</span>
        <p>Search classics by drama title, Urdu name, writer, or star cast.</p>
      </div>
    `;
    return;
  }

  const matches = rows.filter(d => {
    return normalize(d.title).includes(q) ||
      normalize(d.urdu).includes(q) ||
      normalize(d.series).includes(q) ||
      normalize(d.writer).includes(q) ||
      normalize(d.director).includes(q) ||
      normalize(d.cast).includes(q);
  });

  if (matches.length === 0) {
    resultsBox.innerHTML = `
      <div class="m-search-prompt">
        <span>📽</span>
        <p>No classic titles found matching "<b>${esc(q)}</b>".</p>
      </div>
    `;
    return;
  }

  const groups = groupDramas(matches);
  resultsBox.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:12px">
      ${groups.length} title${groups.length !== 1 ? 's' : ''} found
    </div>
    <div class="m-search-grid">
      ${groups.map(g => renderPosterCard(g[0], g.length)).join("")}
    </div>
  `;
}

// ----------------------
// POSTER CARD RENDERER
// Pure artwork on mobile (no text captions underneath)
// ----------------------
function renderPosterCard(d, epCount = 1) {
  const title = isSeries(d) && d.series ? d.series : d.title;
  const playId = seriesStartId(d) || d.id;

  return `
    <div class="netflix-card" onclick="window.location.href='/watch.html?id=${playId}'" title="${esc(title)}">
      <div class="card-media">
        ${d.image ? `
          <img src="${esc(d.image)}" alt="${esc(title)}" loading="lazy" onerror="this.onerror=null; this.src='/logo.png';">
        ` : `
          <div class="card-fallback">
            <span>🎬</span>
            <div class="card-fallback-text">${esc(title)}</div>
          </div>
        `}
        ${epCount > 1 ? `<span class="card-ep-tag">${epCount} Eps</span>` : ''}
      </div>
      <div class="card-info">
        <div class="card-title-line">
          <div class="card-title">${esc(title)}</div>
          ${d.urdu ? `<div class="card-urdu">${esc(d.urdu)}</div>` : ''}
        </div>
        <div class="card-meta-line">
          <span>${esc(d.type)}</span>
          ${d.year ? ` · <span>${esc(d.year)}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ----------------------
// AUTHENTICATION MANAGEMENT
// ----------------------
function openAuthModal() {
  const modal = $("authModal");
  if (!modal) return;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  const msg = $("authStatusMsg");
  if (msg) {
    msg.className = "auth-status-msg";
    msg.textContent = "";
  }
  setTimeout(() => $("authEmail")?.focus(), 50);
}

function closeAuthModal() {
  const modal = $("authModal");
  if (modal) modal.classList.remove("open");
  document.body.style.overflow = "";
}

function toggleAccountMenu() {
  const dd = $("accountDropdown");
  if (dd) dd.classList.toggle("open");
}

window.addEventListener("click", e => {
  if (!e.target.closest(".account-menu-wrap")) {
    const dd = $("accountDropdown");
    if (dd) dd.classList.remove("open");
  }
});

async function handleSignOut() {
  if (sbClient) {
    await sbClient.auth.signOut();
  }
  updateAuthUi(null);
}

function updateAuthUi(session) {
  const container = $("topbarAuthArea");
  if (!container) return;

  if (session?.user) {
    const email = session.user.email || "Admin";
    const initial = email.charAt(0).toUpperCase();
    const shortName = email.split("@")[0];

    container.innerHTML = `
      <div class="account-menu-wrap">
        <button class="account-btn" id="accountMenuBtn" onclick="toggleAccountMenu()">
          <span class="account-avatar">${initial}</span>
          <span class="account-email">${esc(shortName)}</span>
          <span class="account-arrow">▾</span>
        </button>
        <div class="account-dropdown" id="accountDropdown">
          <div class="account-dropdown-header">
            <div style="font-weight:700;color:#fff;font-size:12px;overflow:hidden;text-overflow:ellipsis">${esc(email)}</div>
            <div style="font-size:10px;color:var(--gold);margin-top:2px;font-weight:700">AUTHORIZED ADMIN</div>
          </div>
          <a class="account-dropdown-item gold" href="/admin.html">
            ⚙ Admin Studio
          </a>
          <button class="account-dropdown-item" onclick="handleSignOut()">
            🚪 Sign Out
          </button>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button class="btn-signin" id="signInBtn" onclick="openAuthModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        Sign In
      </button>
    `;
  }
}

function initAuth() {
  if (!sbClient) return;
  const form = $("authModalForm");
  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      const status = $("authStatusMsg");
      const email = $("authEmail").value.trim();
      const password = $("authPassword").value;

      status.className = "auth-status-msg ok";
      status.textContent = "Verifying account credentials…";

      try {
        const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
        if (error) {
          status.className = "auth-status-msg err";
          status.textContent = error.message || "Invalid login credentials.";
          return;
        }

        status.className = "auth-status-msg ok";
        status.textContent = "✓ Signed in! Opening Admin Studio…";
        updateAuthUi(data.session);

        setTimeout(() => {
          window.location.href = "/admin.html";
        }, 500);
      } catch (err) {
        status.className = "auth-status-msg err";
        status.textContent = "Sign in error: " + (err.message || String(err));
      }
    };
  }

  sbClient.auth.getSession().then(({ data }) => {
    updateAuthUi(data?.session);
  });

  sbClient.auth.onAuthStateChange((event, session) => {
    updateAuthUi(session);
  });
}
