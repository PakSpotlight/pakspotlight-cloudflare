/**
 * Pak Spotlight Vault — state, auth & console shell
 */

const SUPABASE_URL = "https://whcseoasnaswlhnzduix.supabase.co";
const SUPABASE_KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";

var sbClient = (window.supabase && typeof window.supabase.createClient === "function")
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
window.sbClient = sbClient;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Inline icon set — one stroke style for the whole console
const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>',
  pinFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
  kebab: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
};
const icon = name => ICONS[name] || "";

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

function isPlaylistUrl(url) {
  const s = String(url || "").trim();
  if (/[?&]list=/.test(s)) return true;
  return /^https?:\/\/(www\.)?youtube\.com\/playlist\//i.test(s);
}

// Global state
let authSession = null;
let allDramas = [];
let configuredCategories = ["Serial / Series", "Long Play", "Comedy", "Shorts"];
let configuredFeaturedIds = [];
let activeTab = "catalog";

// ----------------------------------------------------
// DATA
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

// Re-fetch data and re-render the open tab (keeps the current tab).
async function refreshApp() {
  await fetchArchiveData();
  renderPanes();
  syncTabUi();
}

// ----------------------------------------------------
// AUTH
// ----------------------------------------------------
async function checkAuth() {
  if (!window.sbClient) return;
  const { data: { session } } = await window.sbClient.auth.getSession();
  authSession = session;
  if (!authSession) {
    renderLoginView();
  } else {
    await openConsole();
  }
}

async function openConsole() {
  updateTopAuthUi();
  await fetchArchiveData();
  renderPanes();
  document.body.classList.add("authed");
  $("vaultTabs").hidden = false;
  $("vaultBottomnav").hidden = false;
  syncTabUi();
}

function updateTopAuthUi() {
  const box = $("topbarAuthActions");
  if (!box) return;
  if (authSession?.user) {
    box.innerHTML = `
      <span class="vault-user-email">${esc(authSession.user.email)}</span>
      <a class="btn btn-quiet btn-sm" href="/index.html">Open site</a>
      <button class="btn btn-quiet btn-sm" onclick="handleSignOut()">Sign out</button>
    `;
  } else {
    box.innerHTML = `<a class="btn btn-quiet btn-sm" href="/index.html">Open site</a>`;
  }
}

async function handleSignOut() {
  if (window.sbClient) await window.sbClient.auth.signOut();
  authSession = null;
  document.body.classList.remove("authed");
  $("vaultTabs").hidden = true;
  $("vaultBottomnav").hidden = true;
  renderLoginView();
}

function renderLoginView(errorMsg = "") {
  $("studioApp").innerHTML = `
    <div class="login-card">
      <img src="/logo.png" alt="">
      <div class="login-title">Vault sign-in</div>
      <div class="login-sub">Catalog access for Pak Spotlight admins</div>
      <form id="studioLoginForm">
        <div class="field">
          <label for="loginEmail">Email</label>
          <input type="email" id="loginEmail" required placeholder="admin@pakspotlight.com" autocomplete="username">
        </div>
        <div class="field">
          <label for="loginPass">Password</label>
          <input type="password" id="loginPass" required placeholder="••••••••" autocomplete="current-password">
        </div>
        <button class="btn btn-primary" type="submit">Sign in</button>
        <div class="status ${errorMsg ? 'show err' : ''}" id="loginStatus">${esc(errorMsg)}</div>
      </form>
    </div>
  `;

  $("studioLoginForm").onsubmit = async e => {
    e.preventDefault();
    const stat = $("loginStatus");
    stat.className = "status show info";
    stat.textContent = "Checking credentials…";
    const email = $("loginEmail").value.trim();
    const password = $("loginPass").value;
    const { data, error } = await window.sbClient.auth.signInWithPassword({ email, password });
    if (error) {
      stat.className = "status show err";
      stat.textContent = error.message;
    } else {
      authSession = data.session;
      await openConsole();
    }
  };
}

// ----------------------------------------------------
// CONSOLE SHELL
// ----------------------------------------------------
function renderPanes() {
  const app = $("studioApp");
  app.innerHTML = `
    <section class="vault-pane ${activeTab === 'catalog' ? 'active' : ''}" id="pane-catalog">
      ${renderCatalogPane()}
    </section>
    <section class="vault-pane ${activeTab === 'add' ? 'active' : ''}" id="pane-add">
      ${renderAddPane()}
    </section>
    <section class="vault-pane ${activeTab === 'curation' ? 'active' : ''}" id="pane-curation">
      ${renderCurationPane()}
    </section>
  `;
  bindCatalogEvents();
  bindAddEvents();
}

function switchTab(tab) {
  activeTab = tab;
  syncTabUi();
}

function syncTabUi() {
  document.querySelectorAll(".vault-tab, .vnav-item").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === activeTab);
  });
  document.querySelectorAll(".vault-pane").forEach(p => {
    p.classList.toggle("active", p.id === `pane-${activeTab}`);
  });
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab]");
  if (t && (t.classList.contains("vault-tab") || t.classList.contains("vnav-item"))) {
    switchTab(t.dataset.tab);
  }
});
