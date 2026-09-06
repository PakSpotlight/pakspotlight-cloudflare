/**
 * Pak Spotlight Admin Studio — Netflix-Style Series Management
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
          <div class="panel-sub">Every series groups all its episodes under one title, just like Netflix.</div>
        </div>
        <button class="btn btn-gold" onclick="openNewSeriesModal()">+ Ingest New Series</button>
      </div>

      <div class="search-bar-row">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" id="seriesSearchInput" placeholder="Filter series by name, writer, or star cast…" value="${esc(seriesSearchTerm)}">
        </div>
      </div>

      <div id="seriesAccordionList">
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
            <div class="series-accordion-card" id="seriesCard-${esc(s.name.replace(/[^a-zA-Z0-9]/g, '-'))}">
              <div class="series-card-header" onclick="toggleSeriesAccordion('${esc(s.name.replace(/[^a-zA-Z0-9]/g, '-'))}')">
                <div class="series-poster-box">
                  <img src="${esc(rep.thumbnail_url || '/logo.png')}" alt="${esc(s.name)}" loading="lazy" onerror="this.onerror=null; this.src='/logo.png';">
                </div>
                <div class="series-header-info">
                  <div class="series-title-row">
                    <span class="series-title-text">${esc(s.name)}</span>
                    ${rep.urdu ? `<span class="series-urdu-text">${esc(rep.urdu)}</span>` : ''}
                  </div>
                  <div class="series-badges-row">
                    <span class="pill pill-episodes">${epCount} Episode${epCount !== 1 ? 's' : ''}</span>
                    ${rep.year ? `<span class="pill">${esc(rep.year)}</span>` : ''}
                    <span class="pill pill-gold">${esc(rep.type)}</span>
                    ${isFeat ? `<span class="pill pill-gold">★ Pinned to Top</span>` : ''}
                  </div>
                  <div class="series-meta-credits">
                    ${rep.writer ? `<b>Writer:</b> ${esc(rep.writer)} · ` : ''}
                    ${rep.director ? `<b>Director:</b> ${esc(rep.director)} · ` : ''}
                    ${rep.cast ? `<b>Cast:</b> ${esc(rep.cast.slice(0, 60))}${rep.cast.length > 60 ? '…' : ''}` : ''}
                  </div>
                </div>
                <div class="series-card-actions" onclick="event.stopPropagation()">
                  <button class="btn btn-gold btn-sm" onclick="openAddEpisodeModal('${esc(s.name)}', ${nextEp}, '${esc(rep.type)}', '${esc(rep.writer)}', '${esc(rep.director)}', '${esc(rep.cast)}', '${esc(rep.year)}', '${esc(rep.urdu)}')">
                    + Add Ep ${nextEp}
                  </button>
                  <button class="btn btn-ghost btn-sm" onclick="openBulkEditModal('${esc(s.name)}')">
                    ✎ Bulk Credits
                  </button>
                  <button class="btn btn-ghost btn-sm" onclick="toggleHeroFeature(${rep.id})">
                    ${isFeat ? '★ Top' : '☆ Top'}
                  </button>
                  <a class="btn btn-ghost btn-sm" href="/watch.html?id=${rep.id}" target="_blank">
                    Watch ↗
                  </a>
                </div>
              </div>

              <!-- Accordion Tray -->
              <div class="series-episodes-tray">
                <div class="episodes-tray-header">
                  <span class="episodes-tray-title">Episodes (${epCount})</span>
                  <button class="btn btn-ghost btn-sm" onclick="openAddEpisodeModal('${esc(s.name)}', ${nextEp}, '${esc(rep.type)}', '${esc(rep.writer)}', '${esc(rep.director)}', '${esc(rep.cast)}', '${esc(rep.year)}', '${esc(rep.urdu)}')">
                    + Add Episode to ${esc(s.name)}
                  </button>
                </div>
                <table class="episodes-table">
                  <thead>
                    <tr>
                      <th style="width:50px">#</th>
                      <th style="width:90px">Preview</th>
                      <th>Title</th>
                      <th>Urdu</th>
                      <th>Year</th>
                      <th style="text-align:right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${s.episodes.map(ep => `
                      <tr>
                        <td><span class="ep-num-badge">${ep.episode_number ?? '–'}</span></td>
                        <td>
                          <img class="ep-thumb-preview" src="${esc(ep.thumbnail_url || '/logo.png')}" alt="" onerror="this.onerror=null; this.src='/logo.png';">
                        </td>
                        <td>
                          <span style="font-weight:700;color:#fff">${esc(ep.title)}</span>
                        </td>
                        <td>
                          <span style="font-family:var(--font-urdu);color:var(--gold-ptv);font-size:13px">${esc(ep.urdu)}</span>
                        </td>
                        <td><span style="color:var(--ink-subtle)">${esc(ep.year || '—')}</span></td>
                        <td style="text-align:right;white-space:nowrap">
                          <button class="btn btn-ghost btn-sm" onclick="openEditEpisodeModal(${ep.id})">Edit</button>
                          ${ep.youtube_url ? `<a class="btn btn-ghost btn-sm" href="${esc(ep.youtube_url)}" target="_blank">YT ↗</a>` : ''}
                          <button class="btn btn-danger btn-sm" onclick="deleteDramaRecord(${ep.id}, '${esc(ep.title)}')">✕</button>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function openNewSeriesModal() {
  switchStudioTab('ingest');
  switchIngestSubtab('playlist');
}

function toggleSeriesAccordion(cardId) {
  const card = $(`seriesCard-${cardId}`);
  if (card) card.classList.toggle("open");
}
