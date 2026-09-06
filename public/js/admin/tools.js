/**
 * Pak Spotlight Admin Studio — Archive Toolkit (Auto-Link, Batch Thumbs, Hero Showcase, Categories)
 */

// ============================================================
// TAB 4: ARCHIVE TOOLKIT
// ============================================================
function renderToolsTabHtml() {
  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Archive Automation Toolkit</div>
          <div class="panel-sub">Run automated maintenance across your entire catalog in one click.</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px">
        <!-- Tool 1: Auto-Detect & Link Series -->
        <div style="background:var(--surface-studio);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:20px;display:flex;flex-direction:column;gap:12px">
          <div style="font-size:16px;font-weight:800;color:#fff">⚡ Auto-Link &amp; Group Series</div>
          <p style="font-size:12px;color:var(--ink-subtle);line-height:1.4">
            Scans existing drama titles with episode tags (e.g. "Uss Paar - Ep 13") and automatically sets their <b>series_name</b> and <b>episode_number</b> so they instantly collapse under a clean Netflix series card.
          </p>
          <button class="btn btn-gold" id="autoLinkSeriesBtn" onclick="runAutoLinkSeriesTool()">Scan &amp; Auto-Link All Series</button>
          <div class="status-banner" id="autoLinkStatus"></div>
        </div>

        <!-- Tool 2: Batch Photo Repair -->
        <div style="background:var(--surface-studio);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:20px;display:flex;flex-direction:column;gap:12px">
          <div style="font-size:16px;font-weight:800;color:#fff">🖼 Batch Thumbnail Repair</div>
          <p style="font-size:12px;color:var(--ink-subtle);line-height:1.4">
            Finds any drama or episode missing a photo, pulls the best available thumbnail from YouTube, and uploads it directly to your Supabase Storage bucket.
          </p>
          <button class="btn btn-gold" id="batchSyncThumbsBtn" onclick="runBatchThumbnailSync()">Sync Missing Thumbnails</button>
          <div class="status-banner" id="batchSyncStatus"></div>
        </div>
      </div>
    </div>
  `;
}

async function runAutoLinkSeriesTool() {
  const btn = $("autoLinkSeriesBtn");
  const status = $("autoLinkStatus");
  btn.disabled = true;
  status.className = "status-banner show info";
  status.textContent = "Scanning database for series episodes…";

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

    status.className = "status-banner show ok";
    status.textContent = `Auto-linked ${updatedCount} drama episodes into series! Reloading…`;
    await fetchArchiveData();
    renderStudioDashboard();
  } catch (err) {
    status.className = "status-banner show err";
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

async function runBatchThumbnailSync() {
  const btn = $("batchSyncThumbsBtn");
  const status = $("batchSyncStatus");
  btn.disabled = true;
  status.className = "status-banner show info";
  status.textContent = "Checking for missing photos…";

  const targets = allDramas.filter(d => (!d.thumbnail_url || !d.thumbnail_url.trim()) && d.youtube_url);
  if (targets.length === 0) {
    status.className = "status-banner show ok";
    status.textContent = "All dramas already have artwork!";
    btn.disabled = false;
    return;
  }

  status.textContent = `Syncing ${targets.length} missing photos to Supabase Storage…`;
  let success = 0;

  for (const d of targets) {
    try {
      const ytMatch = d.youtube_url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=))([\w-]{11})/);
      const ytId = ytMatch ? ytMatch[1] : null;
      if (!ytId) continue;
      const imgUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;

      const storeRes = await fetch("/api/store-thumbnail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + authSession?.access_token
        },
        body: JSON.stringify({ dramaId: d.id, imageUrl: imgUrl })
      });
      if (storeRes.ok) success++;
    } catch {}
  }

  status.className = "status-banner show ok";
  status.textContent = `Successfully synced ${success} photos! Reloading…`;
  await fetchArchiveData();
  renderStudioDashboard();
  btn.disabled = false;
}

// ============================================================
// TAB 5 & 6: SHOWCASE (HERO SLIDER) & CATEGORIES
// ============================================================
function renderShowcaseTabHtml() {
  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Home Hero Spotlight (${configuredFeaturedIds.length})</div>
          <div class="panel-sub">Arrange the billboard items shown prominently at the top of the home page.</div>
        </div>
        <button class="btn btn-gold btn-sm" onclick="saveFeaturedList()">Save Spotlight</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px" id="featuredItemsList">
        ${configuredFeaturedIds.map((id, index) => {
          const d = allDramas.find(x => x.id === id);
          if (!d) return '';
          return `
            <div style="display:flex;align-items:center;gap:14px;background:var(--surface-studio);padding:10px 14px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle)">
              <span style="font-weight:800;color:var(--gold-ptv)">#${index + 1}</span>
              <img src="${esc(d.thumbnail_url || '/logo.png')}" alt="" style="width:60px;aspect-ratio:16/9;object-fit:cover;border-radius:4px" onerror="this.onerror=null; this.src='/logo.png';">
              <div style="flex:1">
                <span style="font-weight:700;color:#fff">${esc(d.title)}</span>
                <span style="font-size:12px;color:var(--ink-subtle);margin-left:8px">${esc(d.type)} · ${esc(d.year || 'Classic')}</span>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn-icon" onclick="moveFeaturedOrder(${index}, -1)" ${index === 0 ? 'disabled' : ''}>▲</button>
                <button class="btn-icon" onclick="moveFeaturedOrder(${index}, 1)" ${index === configuredFeaturedIds.length - 1 ? 'disabled' : ''}>▼</button>
                <button class="btn-icon" style="color:var(--danger-crimson)" onclick="removeFeaturedItem(${index})">✕</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <div style="border-top:1px solid var(--border-subtle);padding-top:16px;display:flex;gap:10px;align-items:center">
        <select id="addFeaturedSelect" style="flex:1">
          <option value="">-- Select a drama to pin to Home Spotlight --</option>
          ${allDramas.map(d => `<option value="${d.id}">${esc(d.title)} (${esc(d.year || 'Classic')}) · ${esc(d.type)}</option>`).join("")}
        </select>
        <button class="btn btn-gold btn-sm" onclick="addFeaturedFromSelect()">+ Pin</button>
      </div>
      <div class="status-banner" id="featuredSaveStatus"></div>
    </div>
  `;
}

function moveFeaturedOrder(idx, delta) {
  const target = idx + delta;
  if (target < 0 || target >= configuredFeaturedIds.length) return;
  const item = configuredFeaturedIds.splice(idx, 1)[0];
  configuredFeaturedIds.splice(target, 0, item);
  renderStudioDashboard();
}

function removeFeaturedItem(idx) {
  configuredFeaturedIds.splice(idx, 1);
  renderStudioDashboard();
}

function addFeaturedFromSelect() {
  const val = Number($("addFeaturedSelect").value);
  if (!val || configuredFeaturedIds.includes(val)) return;
  configuredFeaturedIds.push(val);
  renderStudioDashboard();
}

async function toggleHeroFeature(id) {
  const idx = configuredFeaturedIds.indexOf(id);
  if (idx >= 0) configuredFeaturedIds.splice(idx, 1);
  else configuredFeaturedIds.push(id);
  await saveFeaturedList();
  renderStudioDashboard();
}

async function saveFeaturedList() {
  const status = $("featuredSaveStatus");
  if (status) {
    status.className = "status-banner show info";
    status.textContent = "Saving hero slider configuration…";
  }
  try {
    await fetch("/api/featured", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + authSession?.access_token
      },
      body: JSON.stringify({ featuredIds: configuredFeaturedIds })
    });
    if (status) {
      status.className = "status-banner show ok";
      status.textContent = "Saved.";
    }
  } catch (err) {
    if (status) {
      status.className = "status-banner show err";
      status.textContent = err.message;
    }
  }
}

function renderCategoriesTabHtml() {
  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Category Taxonomy (${configuredCategories.length})</div>
          <div class="panel-sub">Manage groups shown in top navigation and browsing carousels.</div>
        </div>
        <button class="btn btn-gold btn-sm" onclick="saveCategoriesConfig()">Save Groups</button>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px" id="categoryChipsList">
        ${configuredCategories.map((c, i) => `
          <div class="pill pill-gold" style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;font-size:13px">
            <span>${esc(c)}</span>
            <button style="background:none;color:inherit;font-size:12px;cursor:pointer" onclick="removeCategoryChip(${i})">✕</button>
          </div>
        `).join("")}
      </div>

      <div style="display:flex;gap:10px;max-width:400px">
        <input type="text" id="newCategoryInput" placeholder="New group name…">
        <button class="btn btn-gold btn-sm" onclick="addNewCategoryChip()">+ Add</button>
      </div>
      <div class="status-banner" id="categorySaveStatus"></div>
    </div>
  `;
}

function addNewCategoryChip() {
  const val = $("newCategoryInput").value.trim();
  if (!val || configuredCategories.includes(val)) return;
  configuredCategories.push(val);
  renderStudioDashboard();
}

function removeCategoryChip(idx) {
  if (configuredCategories.length <= 1) {
    alert("Must keep at least one category.");
    return;
  }
  configuredCategories.splice(idx, 1);
  renderStudioDashboard();
}

async function saveCategoriesConfig() {
  const status = $("categorySaveStatus");
  if (status) {
    status.className = "status-banner show info";
    status.textContent = "Saving category configuration…";
  }
  try {
    await fetch("/api/categories", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + authSession?.access_token
      },
      body: JSON.stringify({ categories: configuredCategories })
    });
    if (status) {
      status.className = "status-banner show ok";
      status.textContent = "Categories saved successfully.";
    }
  } catch (err) {
    if (status) {
      status.className = "status-banner show err";
      status.textContent = err.message;
    }
  }
}
