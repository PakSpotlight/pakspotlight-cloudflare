/**
 * Pak Spotlight Vault — curation
 * What the home page spotlights, how titles are shelved, and upkeep tools.
 */

function renderCurationPane() {
  return `
    ${renderSpotlightSection()}
    ${renderCategoriesSection()}
    ${renderHousekeepingSection()}
  `;
}

// ----------------------------------------------------
// HOME SPOTLIGHT
// ----------------------------------------------------
function renderSpotlightSection() {
  const groups = buildTitleGroups();
  const pinned = configuredFeaturedIds
    .map(id => groups.find(g => g.episodes.some(e => e.id === id)))
    .filter(Boolean);

  const pinCandidates = groups.filter(g => !g.pinned);

  return `
    <div class="sec" id="sec-spotlight">
      <div class="sec-head">
        <div>
          <div class="sec-title">Home spotlight</div>
          <div class="sec-sub">These titles rotate on the home page billboard, in this order.</div>
        </div>
        <button class="btn btn-quiet btn-sm" type="button" onclick="saveFeaturedList()">Save order</button>
      </div>

      ${pinned.length === 0 ? `
        <div class="empty-note" style="margin-top:0">
          Nothing pinned yet. Pin serials or single titles from the catalog, or add one below.
        </div>
      ` : pinned.map((g, index) => `
        <div class="spot-row">
          <span class="spot-rank">${index + 1}</span>
          <img src="${esc(g.cover || '/logo.png')}" alt="" onerror="this.src='/logo.png';">
          <div class="spot-meta">
            <div class="spot-name">${esc(g.name)} ${g.urdu ? `<span class="urdu" style="font-size:12px; margin-left:6px">${esc(g.urdu)}</span>` : ''}</div>
            <div class="spot-sub">${esc(g.type)}${g.year ? `, ${esc(g.year)}` : ''}</div>
          </div>
          <div class="spot-controls">
            <button class="ibtn" type="button" onclick="moveFeaturedOrder(${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Move up">${icon('up')}</button>
            <button class="ibtn" type="button" onclick="moveFeaturedOrder(${index}, 1)" ${index === pinned.length - 1 ? 'disabled' : ''} title="Move down">${icon('down')}</button>
            <button class="ibtn danger" type="button" onclick="removeFeaturedItem(${index})" title="Remove">${icon('close')}</button>
          </div>
        </div>
      `).join("")}

      ${pinCandidates.length ? `
        <div class="pin-add-row">
          <select id="addFeaturedSelect">
            <option value="">Pin another title…</option>
            ${pinCandidates.map(g => `<option value="${g.firstId}">${esc(g.name)}${g.year ? ` (${esc(g.year)})` : ''} — ${esc(g.type)}</option>`).join("")}
          </select>
          <button class="btn btn-quiet" type="button" onclick="addFeaturedFromSelect()">Pin</button>
        </div>
      ` : ''}
      <div class="status" id="featuredSaveStatus"></div>
    </div>
  `;
}

// Pin/unpin a whole catalog title (group). Pinning stores the first
// episode so the billboard starts the serial from episode 1.
async function toggleHeroFeature(g) {
  const groupIds = g.episodes.map(e => e.id);
  const pinnedIds = configuredFeaturedIds.filter(id => groupIds.includes(id));
  if (pinnedIds.length) {
    configuredFeaturedIds = configuredFeaturedIds.filter(id => !groupIds.includes(id));
    vaultToast("Removed from the home spotlight");
  } else {
    configuredFeaturedIds.push(g.firstId);
    vaultToast("Pinned to the home spotlight");
  }
  await saveFeaturedList(null, true);
  renderPanes();
  syncTabUi();
}

function moveFeaturedOrder(idx, delta) {
  const target = idx + delta;
  if (target < 0 || target >= configuredFeaturedIds.length) return;
  const item = configuredFeaturedIds.splice(idx, 1)[0];
  configuredFeaturedIds.splice(target, 0, item);
  renderPanes();
  syncTabUi();
}

function removeFeaturedItem(idx) {
  configuredFeaturedIds.splice(idx, 1);
  renderPanes();
  syncTabUi();
}

function addFeaturedFromSelect() {
  const val = Number($("addFeaturedSelect").value);
  if (!val || configuredFeaturedIds.includes(val)) return;
  configuredFeaturedIds.push(val);
  renderPanes();
  syncTabUi();
}

async function saveFeaturedList(statusEl = null, quiet = false) {
  const status = statusEl || $("featuredSaveStatus");
  try {
    const res = await fetch("/api/featured", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
      body: JSON.stringify({ featuredIds: configuredFeaturedIds })
    });
    if (!res.ok) throw new Error("Could not save the spotlight order.");
    if (status && !quiet) {
      status.className = "status show ok";
      status.textContent = "Spotlight order saved.";
    }
  } catch (err) {
    if (status) {
      status.className = "status show err";
      status.textContent = err.message;
    } else {
      vaultToast(err.message);
    }
  }
}

// ----------------------------------------------------
// CATEGORIES
// ----------------------------------------------------
function renderCategoriesSection() {
  return `
    <div class="sec" id="sec-categories">
      <div class="sec-head">
        <div>
          <div class="sec-title">Categories</div>
          <div class="sec-sub">Each title sits on one shelf; each shelf becomes a row on the home page.</div>
        </div>
        <button class="btn btn-quiet btn-sm" type="button" onclick="saveCategoriesConfig()">Save categories</button>
      </div>

      <div class="cat-edit-row" id="categoryChipsList">
        ${configuredCategories.map((c, i) => `
          <span class="cat-chip">
            ${esc(c)}
            <button type="button" onclick="removeCategoryChip(${i})" title="Remove category">${icon('close')}</button>
          </span>
        `).join("")}
      </div>

      <div class="cat-add-row">
        <input type="text" id="newCategoryInput" placeholder="New category name…" autocomplete="off">
        <button class="btn btn-quiet" type="button" onclick="addNewCategoryChip()">Add</button>
      </div>
      <div class="status" id="categorySaveStatus"></div>
    </div>
  `;
}

function addNewCategoryChip() {
  const val = $("newCategoryInput").value.trim();
  if (!val || configuredCategories.includes(val)) return;
  configuredCategories.push(val);
  $("newCategoryInput").value = "";
  renderPanes();
  syncTabUi();
}

function removeCategoryChip(idx) {
  if (configuredCategories.length <= 1) {
    vaultToast("Keep at least one category.");
    return;
  }
  const removed = configuredCategories[idx];
  const inUse = buildTitleGroups().some(g => normalizeKey(g.type) === normalizeKey(removed));
  if (inUse && !confirm(`"${removed}" still has titles on it. They will keep this name until you re-shelve them. Remove the category anyway?`)) {
    return;
  }
  configuredCategories.splice(idx, 1);
  renderPanes();
  syncTabUi();
}

async function saveCategoriesConfig() {
  const status = $("categorySaveStatus");
  status.className = "status show info";
  status.textContent = "Saving categories…";
  try {
    await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
      body: JSON.stringify({ categories: configuredCategories })
    });
    status.className = "status show ok";
    status.textContent = "Categories saved.";
  } catch (err) {
    status.className = "status show err";
    status.textContent = err.message;
  }
}

// ----------------------------------------------------
// HOUSEKEEPING
// ----------------------------------------------------
function renderHousekeepingSection() {
  return `
    <div class="sec" id="sec-housekeeping">
      <div class="sec-head">
        <div>
          <div class="sec-title">Housekeeping</div>
          <div class="sec-sub">Occasional upkeep across the whole vault.</div>
        </div>
      </div>

      <div class="chore">
        <div class="chore-text">
          <div class="chore-name">Link loose episodes into serials</div>
          <div class="chore-desc">Scans titles like "Uss Paar — Ep 13" that are not part of a serial yet and groups them under their drama name.</div>
        </div>
        <button class="btn btn-quiet" type="button" id="autoLinkSeriesBtn" onclick="runAutoLinkSeriesTool()">Scan and link</button>
      </div>
      <div class="status" id="autoLinkStatus"></div>

      <div class="chore">
        <div class="chore-text">
          <div class="chore-name">Sync missing artwork</div>
          <div class="chore-desc">Pulls the YouTube thumbnail for any title stored without artwork and saves it to your storage.</div>
        </div>
        <button class="btn btn-quiet" type="button" id="batchSyncThumbsBtn" onclick="runSyncArtwork($('batchSyncStatus'))">Sync artwork</button>
      </div>
      <div class="status" id="batchSyncStatus"></div>
    </div>
  `;
}

async function runAutoLinkSeriesTool() {
  const btn = $("autoLinkSeriesBtn");
  const status = $("autoLinkStatus");
  btn.disabled = true;
  status.className = "status show info";
  status.textContent = "Scanning the vault…";

  try {
    let updatedCount = 0;
    for (const d of allDramas) {
      const ep = parseEpisodeNumber(d.title);
      const cleaned = cleanDramaTitle(d.title);
      const needsSeries = !d.series_name && (ep || ["serial / series", "series", "serial"].includes(String(d.type).toLowerCase().trim()));
      const needsEp = d.episode_number == null && ep != null;

      if (needsSeries || needsEp) {
        const updates = {};
        if (needsSeries) updates.series_name = cleaned;
        if (needsEp) updates.episode_number = ep;

        const { error } = await window.sbClient.from("Drama").update(updates).eq("id", d.id);
        if (!error) updatedCount++;
      }
    }

    status.className = "status show ok";
    status.textContent = updatedCount > 0
      ? `Linked ${updatedCount} videos into their serials.`
      : "Nothing to link — every episode is already grouped.";
    await fetchArchiveData();
    renderPanes();
    syncTabUi();
  } catch (err) {
    status.className = "status show err";
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

async function runSyncArtwork(statusEl = null) {
  const useToast = !statusEl;
  const btn = $("batchSyncThumbsBtn");
  if (btn) btn.disabled = true;
  const status = statusEl || $("batchSyncStatus");
  const say = (cls, msg) => {
    if (useToast) vaultToast(msg);
    else if (status) { status.className = `status show ${cls}`; status.textContent = msg; }
  };

  const targets = allDramas.filter(d => (!d.thumbnail_url || !d.thumbnail_url.trim()) && d.youtube_url);
  if (targets.length === 0) {
    say("ok", "Every title already has artwork.");
    if (btn) btn.disabled = false;
    return;
  }

  say("info", `Syncing ${targets.length} missing artwork files…`);
  let success = 0;

  for (const d of targets) {
    try {
      const ytId = extractYouTubeId(d.youtube_url);
      if (!ytId) continue;
      const storeRes = await fetch("/api/store-thumbnail", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
        body: JSON.stringify({ dramaId: d.id, imageUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` })
      });
      if (storeRes.ok) success++;
    } catch {}
  }

  say("ok", `Synced ${success} of ${targets.length} artwork files.`);
  await fetchArchiveData();
  renderPanes();
  syncTabUi();
  if (btn) btn.disabled = false;
}
