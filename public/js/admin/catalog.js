/**
 * Pak Spotlight Vault — catalog ledger (serials + single titles in one list)
 */

let catalogSearch = "";
let catalogFilter = "all";   // all | series | single | <category name>
let expandedKey = null;      // normalized series name currently expanded
let ledgerGroups = [];       // groups rendered by the last renderLedger() call

const normalizeKey = s => String(s || "").toLowerCase().trim();

// Every title in the archive: one group per serial (its episodes)
// and one per standalone play.
function buildTitleGroups() {
  const map = new Map();
  const singles = [];

  for (const d of allDramas) {
    const seriesName = String(d.series_name || "").trim();
    if (seriesName) {
      const k = normalizeKey(seriesName);
      if (!map.has(k)) map.set(k, { kind: "series", name: seriesName, episodes: [] });
      map.get(k).episodes.push(d);
    } else {
      singles.push({ kind: "single", name: d.title, item: d, episodes: [d] });
    }
  }

  const series = Array.from(map.values()).map(g => {
    g.episodes.sort((a, b) => (a.episode_number ?? 9999) - (b.episode_number ?? 9999));
    return g;
  });

  return [...series, ...singles].map(g => {
    const rep = g.episodes.find(e => e.thumbnail_url) || g.episodes[0];
    g.key = g.kind === "series" ? normalizeKey(g.name) : `id::${g.episodes[0].id}`;
    g.rep = rep;
    g.urdu = rep.urdu || "";
    g.year = rep.year || "";
    g.type = rep.type || "";
    g.cover = rep.thumbnail_url || "";
    g.firstId = g.episodes[0].id;
    g.newestId = Math.max(...g.episodes.map(e => e.id));
    g.writer = rep.writer || "";
    g.cast = rep.cast || "";
    g.pinned = g.episodes.some(e => configuredFeaturedIds.includes(e.id));
    return g;
  }).sort((a, b) => b.newestId - a.newestId);
}

function callNo(n) {
  return String(n).padStart(3, "0");
}

function renderCatalogPane() {
  const groups = buildTitleGroups();
  const serialCount = groups.filter(g => g.kind === "series").length;
  const singleCount = groups.length - serialCount;
  const missingArtwork = allDramas.filter(d => !d.thumbnail_url || !d.thumbnail_url.trim()).length;

  return `
    <div class="vault-summary">
      <span><strong>${serialCount}</strong> serial${serialCount !== 1 ? 's' : ''}, <strong>${singleCount}</strong> single title${singleCount !== 1 ? 's' : ''}, <strong>${allDramas.length}</strong> videos in the vault.</span>
      ${missingArtwork > 0
        ? `<span class="alert">${missingArtwork} missing artwork.</span><button class="link-btn" type="button" onclick="runSyncArtwork(null)">Sync artwork</button>`
        : ''}
    </div>

    <div class="catalog-toolbar">
      <div class="search-wrap">
        ${icon("search")}
        <input type="text" id="catalogSearchInput" placeholder="Search titles, writers, cast, Urdu…" value="${esc(catalogSearch)}" autocomplete="off">
      </div>
      <div class="chip-row" id="catalogChips">
        ${renderFilterChips()}
      </div>
    </div>

    <div id="ledgerBox"></div>
  `;
}

function renderFilterChips() {
  const chip = (id, label) => `
    <button class="chip ${catalogFilter === id ? 'active' : ''}" type="button" data-filter="${esc(id)}">${esc(label)}</button>
  `;
  return [
    chip("all", "All"),
    chip("series", "Serials"),
    chip("single", "Singles"),
    ...configuredCategories.map(c => chip(c, c))
  ].join("");
}

function bindCatalogEvents() {
  const input = $("catalogSearchInput");
  if (input) {
    input.addEventListener("input", e => {
      catalogSearch = e.target.value.trim();
      renderLedger(); // filter in place — the input keeps focus
    });
  }

  const chips = $("catalogChips");
  if (chips) {
    chips.addEventListener("click", e => {
      const c = e.target.closest("[data-filter]");
      if (!c) return;
      catalogFilter = c.dataset.filter;
      chips.querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x.dataset.filter === catalogFilter));
      renderLedger();
    });
  }

  const ledger = $("ledgerBox");
  if (ledger) {
    ledger.addEventListener("click", onLedgerClick);
    ledger.addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("title-row")) {
        e.preventDefault();
        e.target.click();
      }
    });
  }

  renderLedger();
}

function renderLedger() {
  const box = $("ledgerBox");
  if (!box) return;

  let groups = buildTitleGroups();

  if (catalogFilter === "series") groups = groups.filter(g => g.kind === "series");
  else if (catalogFilter === "single") groups = groups.filter(g => g.kind === "single");
  else if (catalogFilter !== "all") groups = groups.filter(g => normalizeKey(g.type) === normalizeKey(catalogFilter));

  if (catalogSearch) {
    const q = catalogSearch.toLowerCase();
    groups = groups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.urdu || "").includes(q) ||
      (g.writer || "").toLowerCase().includes(q) ||
      (g.cast || "").toLowerCase().includes(q) ||
      (g.type || "").toLowerCase().includes(q) ||
      (g.year || "").includes(q) ||
      g.episodes.some(e => e.title.toLowerCase().includes(q))
    );
  }

  ledgerGroups = groups;

  if (groups.length === 0) {
    if (allDramas.length === 0) {
      box.innerHTML = `
        <div class="empty-note">
          <p>The vault is empty.</p>
          <p style="margin-top:6px">Add your first title from YouTube in <button class="link-btn" type="button" onclick="switchTab('add')">Add content</button>.</p>
        </div>
      `;
      return;
    }
    box.innerHTML = `
      <div class="empty-note">
        <p>No titles match ${catalogSearch ? `"${esc(catalogSearch)}"` : "this filter"}.</p>
        <p style="margin-top:6px">Check the spelling or try a different filter.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = `<div class="ledger">${groups.map(renderTitleRow).join("")}</div>`;
}

function renderTitleRow(g, i) {
  const isSeries = g.kind === "series";
  const open = isSeries && expandedKey === g.key;
  const meta = [
    g.writer ? `Writer ${g.writer}` : "",
    g.cast ? `Cast ${g.cast}` : ""
  ].filter(Boolean).join(", ");

  return `
    <div class="ledger-row" data-i="${i}">
      <div class="title-row" data-i="${i}" role="button" tabindex="0" aria-expanded="${open}">
        <span class="callno">${callNo(g.firstId)}</span>
        <div class="ledger-thumb ${g.cover ? '' : 'empty'}">
          ${g.cover
            ? `<img src="${esc(g.cover)}" alt="" loading="lazy" onerror="this.remove();">`
            : `<span>No artwork</span>`}
        </div>
        <div class="title-block">
          <div class="title-line">
            ${g.pinned ? `<span class="pin-badge" title="Pinned to the home page">${icon("pinFilled")}</span>` : ''}
            <span class="title-name">${esc(g.name)}</span>
            ${g.urdu ? `<span class="title-urdu urdu">${esc(g.urdu)}</span>` : ''}
          </div>
          ${meta ? `<div class="title-sub">${esc(meta)}</div>` : ''}
        </div>
        <span class="ledger-col">${esc(g.type)}</span>
        <span class="ledger-col">${esc(g.year || '—')}</span>
        <span class="ledger-col strong">${isSeries ? `${g.episodes.length} ep${g.episodes.length !== 1 ? 's' : ''}` : 'Single'}</span>
        <div class="row-actions">
          <button class="ibtn ${g.pinned ? 'active' : ''}" type="button" data-act="pin" data-i="${i}" title="${g.pinned ? 'Remove from home spotlight' : 'Pin to home spotlight'}">${icon(g.pinned ? 'pinFilled' : 'pin')}</button>
          <button class="ibtn" type="button" data-act="edit" data-i="${i}" title="Edit details">${icon('pencil')}</button>
          <a class="ibtn" href="/watch.html?id=${g.firstId}" target="_blank" rel="noopener" title="Watch on site">${icon('external')}</a>
          <button class="ibtn danger" type="button" data-act="delete" data-i="${i}" title="Delete">${icon('trash')}</button>
          ${isSeries ? `<button class="ibtn" type="button" data-act="expand" data-i="${i}" title="Show episodes" style="transform:rotate(${open ? '180deg' : '0deg'})">${icon('chevron')}</button>` : ''}
          <button class="ibtn kebab" type="button" data-act="kebab" data-i="${i}" title="More actions">${icon('kebab')}</button>
        </div>
      </div>
      ${isSeries ? renderReel(g, i, open) : ''}
    </div>
  `;
}

function renderReel(g, i, open) {
  return `
    <div class="reel ${open ? 'open' : ''}" data-reel="${i}">
      <div>
        <div class="reel-inner">
          <div class="reel-head">
            <span class="reel-label">${g.episodes.length} episode${g.episodes.length !== 1 ? 's' : ''}</span>
            <div class="reel-actions">
              <button class="btn btn-quiet btn-sm" type="button" data-act="add-ep" data-i="${i}">${icon('plus')} Add episode</button>
              <button class="btn btn-quiet btn-sm" type="button" data-act="import-pl" data-i="${i}">${icon('import')} Import playlist</button>
              <button class="btn btn-primary btn-sm" type="button" data-act="edit" data-i="${i}">Edit series</button>
            </div>
          </div>
          ${g.episodes.map((ep, idx) => `
            <div class="ep-row">
              <span class="ep-no">${ep.episode_number ?? idx + 1}</span>
              <div class="ep-thumb">
                ${ep.thumbnail_url
                  ? `<img src="${esc(ep.thumbnail_url)}" alt="" loading="lazy" onerror="this.remove();">`
                  : ''}
              </div>
              <span class="ep-title">${esc(ep.title)}</span>
              <div class="ep-actions">
                <button class="ibtn" type="button" data-act="ep-edit" data-i="${i}" data-ep="${ep.id}" title="Edit episode">${icon('pencil')}</button>
                <button class="ibtn danger" type="button" data-act="ep-delete" data-i="${i}" data-ep="${ep.id}" title="Delete episode">${icon('trash')}</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// LEDGER EVENTS (delegated)
// ----------------------------------------------------
function onLedgerClick(e) {
  const actBtn = e.target.closest("[data-act]");
  const iAttr = actBtn?.dataset.i ?? e.target.closest(".title-row")?.dataset.i;
  if (iAttr == null) return;
  const g = ledgerGroups[Number(iAttr)];
  if (!g) return;

  if (actBtn) {
    e.stopPropagation();
    const act = actBtn.dataset.act;
    if (act === "pin") toggleHeroFeature(g);
    else if (act === "edit") g.kind === "series" ? openSeriesEditModal(g.name) : openEditRecordModal(g.episodes[0].id);
    else if (act === "delete") g.kind === "series" ? deleteSeries(g.name) : deleteDramaRecord(g.episodes[0].id, g.name);
    else if (act === "expand") toggleExpand(g.key);
    else if (act === "kebab") openTitleActionSheet(g);
    else if (act === "add-ep") openAddEpisodeModal(g.name);
    else if (act === "import-pl") openSeriesImportModal(g.name);
    else if (act === "ep-edit") openEditRecordModal(Number(actBtn.dataset.ep));
    else if (act === "ep-delete") {
      const ep = g.episodes.find(x => x.id === Number(actBtn.dataset.ep));
      if (ep) deleteDramaRecord(ep.id, ep.title, g.name);
    }
    return;
  }

  // Row body click: serials expand, singles open the editor
  if (g.kind === "series") toggleExpand(g.key);
  else openEditRecordModal(g.episodes[0].id);
}

function toggleExpand(key) {
  expandedKey = expandedKey === key ? null : key;
  renderLedger();
}
