/**
 * Pak Spotlight Admin Studio — State, Auth & Core Dashboard Shell
 */

const SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
const SUPABASE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";

// Safe initialization to avoid SyntaxError: Identifier 'supabase' has already been declared
var sbClient = (window.supabase && typeof window.supabase.createClient === "function")
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
window.sbClient = sbClient;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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

function extractYouTubeId(url) {
  if (!url) return "";
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=))([\w-]{11})/);
  return m ? m[1] : "";
}

// Global State
let authSession = null;
let allDramas = [];
let configuredCategories = ["Serial / Series", "Long Play", "Comedy", "Shorts"];
let configuredFeaturedIds = [];
let activeStudioTab = "series";
let seriesSearchTerm = "";
let playsSearchTerm = "";

// ----------------------------------------------------
// ARCHIVE DATA LOADING
// ----------------------------------------------------
async function fetchArchiveData() {
  if (!window.sbClient) return;
  const [dramaRes, catRes, featRes] = await Promise.all([
    window.sbClient.from("Drama").select("*").order("id", { ascending: false }),
    fetch("/api/categories").catch(() => null),
    fetch("/api/featured").catch(() => null)
  ]);

  if (dramaRes.data) {
    allDramas = dramaRes.data.map(r => {
      const parsedEp = r.episode_number != null ? Number(r.episode_number) : parseEpisodeNumber(r.title);
      const rawSeries = (r.series_name || "").trim();
      const cleanedTitle = cleanDramaTitle(r.title);
      const isSerialType = ["serial / series", "series", "serial"].includes(String(r.type || "").toLowerCase().trim());
      const inferredSeries = rawSeries || (parsedEp || isSerialType ? cleanedTitle : "");

      return {
        id: r.id,
        title: r.title || "Untitled",
        urdu: r.urdu_title || "",
        year: r.year || "",
        type: r.type || "Serial / Series",
        series_name: inferredSeries,
        episode_number: parsedEp,
        writer: r.writer || "",
        director: r.director || "",
        produced: r.produced || "",
        cast: r.cast || "",
        description: r.description || "",
        youtube_url: r.youtube_url || "",
        thumbnail_url: r.thumbnail_url || ""
      };
    });
  }

  if (catRes && catRes.ok) {
    const catData = await catRes.json();
    if (Array.isArray(catData.categories)) configuredCategories = catData.categories;
  }
  if (featRes && featRes.ok) {
    const featData = await featRes.json();
    if (Array.isArray(featData.featuredIds)) configuredFeaturedIds = featData.featuredIds;
  }
}

// ----------------------------------------------------
// AUTHENTICATION & LOGIN
// ----------------------------------------------------
async function checkAuth() {
  if (!window.sbClient) return;
  const { data: { session } } = await window.sbClient.auth.getSession();
  authSession = session;
  if (!authSession) {
    renderLoginView();
  } else {
    updateTopAuthUi();
    await fetchArchiveData();
    renderStudioDashboard();
  }
}

function updateTopAuthUi() {
  const container = $("topbarAuthActions");
  if (!container) return;
  if (authSession?.user) {
    container.innerHTML = `
      <span style="font-size:12px;color:var(--ink-subtle);font-weight:600">👤 ${esc(authSession.user.email)}</span>
      <a class="btn btn-ghost btn-sm" href="/index.html">← Public Site</a>
      <button class="btn btn-ghost btn-sm" onclick="handleSignOut()">Sign Out</button>
    `;
  } else {
    container.innerHTML = `<a class="btn btn-ghost btn-sm" href="/index.html">← Public Site</a>`;
  }
}

async function handleSignOut() {
  if (window.sbClient) await window.sbClient.auth.signOut();
  authSession = null;
  renderLoginView();
}

function renderLoginView(errorMsg = "") {
  $("studioApp").innerHTML = `
    <div style="max-width:420px;margin:80px auto;background:var(--surface-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:32px;box-shadow:0 12px 36px rgba(0,0,0,0.6)">
      <div style="text-align:center;margin-bottom:24px">
        <img src="/logo.png" alt="" style="width:54px;height:54px;margin-bottom:12px">
        <h2 style="font-family:var(--font-serif);font-size:20px;letter-spacing:1px;color:#fff">Admin Sign In</h2>
        <p style="font-size:12px;color:var(--ink-subtle);margin-top:4px">Pak Spotlight Master Studio Console</p>
      </div>
      <form id="studioLoginForm">
        <div class="form-group" style="margin-bottom:14px">
          <label>Email Address</label>
          <input type="email" id="loginEmail" required placeholder="admin@pakspotlight.com" autocomplete="username">
        </div>
        <div class="form-group" style="margin-bottom:20px">
          <label>Password</label>
          <input type="password" id="loginPass" required placeholder="••••••••" autocomplete="current-password">
        </div>
        <button class="btn btn-gold" type="submit" style="width:100%">Authorize & Sign In</button>
        <div class="status-banner ${errorMsg ? 'show err' : ''}" id="loginStatus">${esc(errorMsg)}</div>
      </form>
    </div>
  `;

  $("studioLoginForm").onsubmit = async e => {
    e.preventDefault();
    const stat = $("loginStatus");
    stat.className = "status-banner show info";
    stat.textContent = "Authenticating…";
    const email = $("loginEmail").value.trim();
    const password = $("loginPass").value;
    const { data, error } = await window.sbClient.auth.signInWithPassword({ email, password });
    if (error) {
      stat.className = "status-banner show err";
      stat.textContent = error.message;
    } else {
      authSession = data.session;
      updateTopAuthUi();
      await fetchArchiveData();
      renderStudioDashboard();
    }
  };
}

// ----------------------------------------------------
// MASTER STUDIO DASHBOARD SHELL
// ----------------------------------------------------
function renderStudioDashboard() {
  const seriesGroups = getSeriesGroups();
  const standalonePlays = getStandalonePlays();
  const missingPhotos = allDramas.filter(d => !d.thumbnail_url || !d.thumbnail_url.trim()).length;

  $("studioApp").innerHTML = `
    <!-- Metrics Strip -->
    <div class="metrics-strip">
      <div class="metric-card">
        <span class="metric-label">Drama Series</span>
        <span class="metric-value">${seriesGroups.length}</span>
        <span class="metric-desc">Grouped drama sagas</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Total Episodes</span>
        <span class="metric-value">${allDramas.length}</span>
        <span class="metric-desc">In entire video archive</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Single Plays</span>
        <span class="metric-value">${standalonePlays.length}</span>
        <span class="metric-desc">Long plays & telefilms</span>
      </div>
      <div class="metric-card ${missingPhotos > 0 ? 'alert' : ''}">
        <span class="metric-label">Missing Photos</span>
        <span class="metric-value">${missingPhotos}</span>
        <span class="metric-desc">${missingPhotos > 0 ? 'Use Toolkit to sync photos' : 'All videos have artwork'}</span>
      </div>
    </div>

    <!-- Primary Navigation Tabs -->
    <div class="studio-tabs-bar">
      <button class="tab-btn ${activeStudioTab === 'series' ? 'active' : ''}" onclick="switchStudioTab('series')">
        📺 Drama Series <span class="tab-count">${seriesGroups.length}</span>
      </button>
      <button class="tab-btn ${activeStudioTab === 'plays' ? 'active' : ''}" onclick="switchStudioTab('plays')">
        🎬 Single Plays <span class="tab-count">${standalonePlays.length}</span>
      </button>
      <button class="tab-btn ${activeStudioTab === 'ingest' ? 'active' : ''}" onclick="switchStudioTab('ingest')">
        ⚡ Quick Ingest &amp; AI
      </button>
      <button class="tab-btn ${activeStudioTab === 'tools' ? 'active' : ''}" onclick="switchStudioTab('tools')">
        🛠 Archive Toolkit
      </button>
      <button class="tab-btn ${activeStudioTab === 'showcase' ? 'active' : ''}" onclick="switchStudioTab('showcase')">
        ⭐ Hero Showcase <span class="tab-count">${configuredFeaturedIds.length}</span>
      </button>
      <button class="tab-btn ${activeStudioTab === 'categories' ? 'active' : ''}" onclick="switchStudioTab('categories')">
        📁 Groups <span class="tab-count">${configuredCategories.length}</span>
      </button>
    </div>

    <!-- TAB PANES -->
    <div id="tabContent-series" class="tab-pane ${activeStudioTab === 'series' ? 'active' : ''}">
      ${renderSeriesTabHtml(seriesGroups)}
    </div>

    <div id="tabContent-plays" class="tab-pane ${activeStudioTab === 'plays' ? 'active' : ''}">
      ${renderPlaysTabHtml(standalonePlays)}
    </div>

    <div id="tabContent-ingest" class="tab-pane ${activeStudioTab === 'ingest' ? 'active' : ''}">
      ${renderIngestTabHtml()}
    </div>

    <div id="tabContent-tools" class="tab-pane ${activeStudioTab === 'tools' ? 'active' : ''}">
      ${renderToolsTabHtml()}
    </div>

    <div id="tabContent-showcase" class="tab-pane ${activeStudioTab === 'showcase' ? 'active' : ''}">
      ${renderShowcaseTabHtml()}
    </div>

    <div id="tabContent-categories" class="tab-pane ${activeStudioTab === 'categories' ? 'active' : ''}">
      ${renderCategoriesTabHtml()}
    </div>
  `;

  bindStudioEvents();
}

function switchStudioTab(tab) {
  activeStudioTab = tab;
  document.querySelectorAll(".studio-tabs-bar .tab-btn").forEach(b => {
    b.classList.toggle("active", b.textContent.includes(tab) ||
      (tab === 'series' && b.textContent.includes('Series')) ||
      (tab === 'plays' && b.textContent.includes('Single')) ||
      (tab === 'ingest' && b.textContent.includes('Ingest')) ||
      (tab === 'tools' && b.textContent.includes('Toolkit')) ||
      (tab === 'showcase' && b.textContent.includes('Hero')) ||
      (tab === 'categories' && b.textContent.includes('Groups')));
  });
  document.querySelectorAll(".tab-pane").forEach(p => {
    p.classList.toggle("active", p.id === `tabContent-${tab}`);
  });
}

function bindStudioEvents() {
  const sInput = $("seriesSearchInput");
  if (sInput) {
    sInput.addEventListener("input", e => {
      seriesSearchTerm = e.target.value.trim();
      renderStudioDashboard();
      const next = $("seriesSearchInput");
      if (next) { next.focus(); next.selectionStart = next.selectionEnd = next.value.length; }
    });
  }

  const pInput = $("playsSearchInput");
  if (pInput) {
    pInput.addEventListener("input", e => {
      playsSearchTerm = e.target.value.trim();
      renderStudioDashboard();
      const next = $("playsSearchInput");
      if (next) { next.focus(); next.selectionStart = next.selectionEnd = next.value.length; }
    });
  }

  bindIngestFormEvents();
}
