/**
 * Pak Spotlight Admin Studio — Netflix Series Catalog & Episode Manager
 */

function getSeriesGroups() {
  const seriesMap = new Map();
  allDramas.forEach(d => {
    const isSer = !!d.series_name || ["serial / series", "series", "serial"].includes(String(d.type || "").toLowerCase().trim());
    if (isSer && d.series_name) {
      const k = d.series_name.toLowerCase().trim();
      if (!seriesMap.has(k)) seriesMap.set(k, { name: d.series_name, episodes: [] });
      seriesMap.get(k).episodes.push(d);
    }
  });
  return Array.from(seriesMap.values()).map(s => {
    s.episodes.sort((a, b) => (a.episode_number ?? 9999) - (b.episode_number ?? 9999));
    s.rep = s.episodes.find(e => e.thumbnail_url) || s.episodes[0];
    return s;
  });
}

function renderSeriesTabHtml(seriesGroups) {
  let filtered = seriesGroups;
  if (seriesSearchTerm) {
    const q = seriesSearchTerm.toLowerCase();
    filtered = seriesGroups.filter(s => {
      return s.name.toLowerCase().includes(q) ||
        s.episodes.some(e => e.writer.toLowerCase().includes(q) || e.director.toLowerCase().includes(q) || e.cast.toLowerCase().includes(q) || e.urdu.toLowerCase().includes(q));
    });
  }

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Drama Series Catalog (${seriesGroups.length})</div>
          <div class="panel-sub">Select any series to manage its episodes, import from a playlist, or add new links.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-gold" onclick="openCreateSeriesModal()">+ Create New Series Cover</button>
          <button class="btn btn-ghost" onclick="switchStudioTab('ingest')">📑 Import Playlist</button>
        </div>
      </div>

      <div class="search-bar-row">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" id="seriesSearchInput" placeholder="Filter series by name, Urdu title, writer, or star cast…" value="${esc(seriesSearchTerm)}">
        </div>
      </div>

      <div class="series-list-container">
        ${filtered.length === 0 ? `
          <div style="padding:40px;text-align:center;color:var(--ink-subtle);border:1px dashed var(--border-subtle);border-radius:var(--radius-md)">
            No drama series found matching "${esc(seriesSearchTerm)}".
          </div>
        ` : filtered.map(s => {
          const rep = s.rep || {};
          const epCount = s.episodes.length;
          const isFeat = configuredFeaturedIds.includes(rep.id);
          const maxEp = Math.max(...s.episodes.map(e => e.episode_number || 0), 0);
          const nextEp = maxEp + 1;

          return `
            <div class="series-row-card">
              <div class="series-row-main" onclick="openSeriesManager('${esc(s.name)}')">
                <div class="series-row-thumb">
                  <img src="${esc(rep.thumbnail_url || '/logo.png')}" alt="${esc(s.name)}" loading="lazy" onerror="this.onerror=null; this.src='/logo.png';">
                </div>
                <div class="series-row-details">
                  <div class="series-row-title-line">
                    <span class="series-row-title">${esc(s.name)}</span>
                    ${rep.urdu ? `<span class="series-row-urdu">${esc(rep.urdu)}</span>` : ''}
                  </div>
                  <div class="series-row-pills">
                    <span class="pill pill-episodes">${epCount} Ep${epCount !== 1 ? 's' : ''}</span>
                    ${rep.year ? `<span class="pill">${esc(rep.year)}</span>` : ''}
                    <span class="pill pill-gold">${esc(rep.type)}</span>
                    ${isFeat ? `<span class="pill pill-gold">★ Pinned</span>` : ''}
                  </div>
                  <div class="series-row-credits">
                    ${rep.writer ? `Writer: ${esc(rep.writer)} · ` : ''}
                    ${rep.cast ? `Cast: ${esc(rep.cast)}` : ''}
                  </div>
                </div>
              </div>

              <div class="series-row-actions">
                <button class="btn btn-gold btn-sm" onclick="openAddEpisodeModal('${esc(s.name)}', ${nextEp}, '${esc(rep.type)}', '${esc(rep.writer)}', '${esc(rep.director)}', '${esc(rep.cast)}', '${esc(rep.year)}', '${esc(rep.urdu)}')">
                  + Ep ${nextEp}
                </button>
                <button class="btn btn-ghost btn-sm" onclick="openSeriesManager('${esc(s.name)}')">
                  Manage Episodes
                </button>
                <button class="btn btn-ghost btn-sm" onclick="openBulkEditModal('${esc(s.name)}')">
                  ✎ Edit
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteEntireSeries('${esc(s.name)}')">
                  🗑 Delete
                </button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// DEDICATED SERIES EPISODE MANAGER MODAL / DRAWER
// ----------------------------------------------------
function openSeriesManager(seriesName) {
  const series = getSeriesGroups().find(s => s.name.toLowerCase() === seriesName.toLowerCase());
  if (!series) return;
  const rep = series.rep || {};
  const epCount = series.episodes.length;
  const maxEp = Math.max(...series.episodes.map(e => e.episode_number || 0), 0);
  const nextEp = maxEp + 1;

  openModal(`
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:10px">
        <h3 class="modal-title">${esc(series.name)}</h3>
        ${rep.urdu ? `<span class="series-row-urdu">${esc(rep.urdu)}</span>` : ''}
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <!-- Series Overview Banner -->
    <div class="series-manager-banner">
      <img class="series-manager-cover" src="${esc(rep.thumbnail_url || '/logo.png')}" alt="" onerror="this.onerror=null; this.src='/logo.png';">
      <div class="series-manager-info">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="pill pill-episodes">${epCount} Episodes</span>
          ${rep.year ? `<span class="pill">${esc(rep.year)}</span>` : ''}
          <span class="pill pill-gold">${esc(rep.type)}</span>
        </div>
        <div style="font-size:12px;color:var(--ink-subtle)">
          ${rep.writer ? `<b>Writer:</b> ${esc(rep.writer)} · ` : ''}
          ${rep.director ? `<b>Director:</b> ${esc(rep.director)}<br>` : ''}
          ${rep.cast ? `<b>Cast:</b> ${esc(rep.cast)}` : ''}
        </div>
        <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="openBulkEditModal('${esc(series.name)}')">✎ Edit Series Metadata</button>
          <a class="btn btn-ghost btn-sm" href="/watch.html?id=${rep.id}" target="_blank">Watch on Site ↗</a>
          <button class="btn btn-danger btn-sm" onclick="deleteEntireSeries('${esc(series.name)}')">🗑 Delete Entire Series</button>
        </div>
      </div>
    </div>

    <!-- Quick Action Toggles: Add Single Link vs Import Playlist -->
    <div class="manager-action-toggles">
      <button class="manager-action-btn" id="toggleAddEpBtn" onclick="toggleSeriesManagerBox('single')">
        ➕ Add Single Episode Link
      </button>
      <button class="manager-action-btn" id="toggleImportPlBtn" onclick="toggleSeriesManagerBox('playlist')">
        📑 Batch Import Playlist
      </button>
    </div>

    <!-- Sub-Form 1: Quick Add Single Episode -->
    <div class="manager-action-form-box" id="boxQuickAddEp">
      <form id="quickAddEpForm" onsubmit="handleQuickAddEpSubmit(event, '${esc(series.name)}', ${nextEp}, '${esc(rep.type)}', '${esc(rep.writer)}', '${esc(rep.director)}', '${esc(rep.cast)}', '${esc(rep.year)}', '${esc(rep.urdu)}')">
        <label style="font-size:12px;font-weight:700;color:var(--gold-ptv);margin-bottom:6px;display:block">
          Paste YouTube Video Link for Episode ${nextEp}
        </label>
        <div style="display:flex;gap:8px">
          <input type="url" id="quickEpUrl" placeholder="https://www.youtube.com/watch?v=..." required style="flex:1">
          <input type="number" id="quickEpNum" value="${nextEp}" min="1" style="width:70px" title="Episode number">
          <button type="submit" class="btn btn-gold btn-sm" id="quickEpSubmitBtn">+ Add Episode</button>
        </div>
        <div class="status-banner" id="quickEpStatus"></div>
      </form>
    </div>

    <!-- Sub-Form 2: Batch Import Playlist into this series -->
    <div class="manager-action-form-box" id="boxImportPlaylist">
      <form id="seriesPlForm" onsubmit="handleSeriesPlaylistSubmit(event, '${esc(series.name)}', '${esc(rep.type)}')">
        <label style="font-size:12px;font-weight:700;color:var(--gold-ptv);margin-bottom:6px;display:block">
          Paste YouTube Playlist Link (imports all episodes under "${esc(series.name)}")
        </label>
        <div style="display:flex;gap:8px">
          <input type="url" id="seriesPlUrl" placeholder="https://www.youtube.com/playlist?list=..." required style="flex:1">
          <button type="submit" class="btn btn-gold btn-sm" id="seriesPlSubmitBtn">Import Playlist</button>
        </div>
        <div class="status-banner" id="seriesPlStatus"></div>
      </form>
    </div>

    <!-- Episodes Table -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <span style="font-size:13px;font-weight:800;text-transform:uppercase;color:var(--ink-subtle);letter-spacing:1px">
        Episodes (${epCount})
      </span>
    </div>

    <table class="episodes-table">
      <thead>
        <tr>
          <th style="width:45px">#</th>
          <th style="width:70px">Photo</th>
          <th>Title</th>
          <th>Urdu</th>
          <th style="text-align:right">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${series.episodes.map(ep => `
          <tr>
            <td><span class="ep-num-badge">${ep.episode_number ?? '–'}</span></td>
            <td>
              <img class="ep-thumb-preview" src="${esc(ep.thumbnail_url || '/logo.png')}" alt="" onerror="this.onerror=null; this.src='/logo.png';">
            </td>
            <td><span style="font-weight:700;color:#fff">${esc(ep.title)}</span></td>
            <td><span style="font-family:var(--font-urdu);color:var(--gold-ptv);font-size:13px">${esc(ep.urdu)}</span></td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="openEditEpisodeModal(${ep.id})">Edit</button>
              ${ep.youtube_url ? `<a class="btn btn-ghost btn-sm" href="${esc(ep.youtube_url)}" target="_blank">YT ↗</a>` : ''}
              <button class="btn btn-danger btn-sm" onclick="deleteDramaRecord(${ep.id}, '${esc(ep.title)}', '${esc(series.name)}')">🗑 Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `);
}

function toggleSeriesManagerBox(type) {
  const sBox = $("boxQuickAddEp");
  const pBox = $("boxImportPlaylist");
  const sBtn = $("toggleAddEpBtn");
  const pBtn = $("toggleImportPlBtn");

  if (type === "single") {
    const isNowOpen = sBox.classList.toggle("open");
    pBox.classList.remove("open");
    sBtn.classList.toggle("active", isNowOpen);
    pBtn.classList.remove("active");
    if (isNowOpen) $("quickEpUrl")?.focus();
  } else {
    const isNowOpen = pBox.classList.toggle("open");
    sBox.classList.remove("open");
    pBtn.classList.toggle("active", isNowOpen);
    sBtn.classList.remove("active");
    if (isNowOpen) $("seriesPlUrl")?.focus();
  }
}

async function handleQuickAddEpSubmit(e, seriesName, nextEp, type, writer, director, cast, year, urdu) {
  e.preventDefault();
  const url = $("quickEpUrl").value.trim();
  const epNum = Number($("quickEpNum").value) || nextEp;
  const status = $("quickEpStatus");
  const btn = $("quickEpSubmitBtn");
  if (!url) return;

  btn.disabled = true;
  status.className = "status-banner show info";
  status.textContent = "Detecting video & adding to series…";

  try {
    let videoTitle = `${seriesName} - Episode ${epNum}`;
    let thumb = "";
    try {
      const idRes = await fetch("/api/identify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + authSession?.access_token
        },
        body: JSON.stringify({ url })
      });
      const idData = await idRes.json();
      if (idData?.title) videoTitle = cleanDramaTitle(idData.title) || videoTitle;
      thumb = idData?.thumbnail || `https://i.ytimg.com/vi/${extractYouTubeId(url)}/hqdefault.jpg`;
    } catch {}

    const payload = {
      title: videoTitle,
      urdu_title: urdu || "",
      series_name: seriesName,
      episode_number: epNum,
      year: year || "",
      type: type || "Serial / Series",
      writer: writer || "",
      director: director || "",
      cast: cast || "",
      youtube_url: url,
      thumbnail_url: thumb
    };

    const { data, error } = await window.sbClient.from("Drama").insert(payload).select().single();
    if (error) throw error;

    if (data?.id && thumb) {
      fetch("/api/store-thumbnail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + authSession?.access_token
        },
        body: JSON.stringify({ dramaId: data.id, imageUrl: thumb })
      }).catch(() => {});
    }

    status.className = "status-banner show ok";
    status.textContent = `Added Episode ${epNum} to ${seriesName}!`;
    await fetchArchiveData();
    openSeriesManager(seriesName);
  } catch (err) {
    status.className = "status-banner show err";
    status.textContent = err.message;
    btn.disabled = false;
  }
}

async function handleSeriesPlaylistSubmit(e, seriesName, type) {
  e.preventDefault();
  const url = $("seriesPlUrl").value.trim();
  const status = $("seriesPlStatus");
  const btn = $("seriesPlSubmitBtn");
  if (!url) return;

  btn.disabled = true;
  status.className = "status-banner show info";
  status.textContent = "Importing playlist into series…";

  try {
    const res = await fetch("/api/playlist-import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + authSession?.access_token
      },
      body: JSON.stringify({
        url,
        seriesName,
        category: type
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Import failed");

    status.className = "status-banner show ok";
    status.textContent = `Added ${data.added} episodes to ${seriesName}! (${data.skipped} already present).`;
    await fetchArchiveData();
    openSeriesManager(seriesName);
  } catch (err) {
    status.className = "status-banner show err";
    status.textContent = err.message;
    btn.disabled = false;
  }
}
