/**
 * Pak Spotlight Admin Studio — Standalone Plays & Telefilms Catalog
 */

function getStandalonePlays() {
  return allDramas.filter(d => {
    const isSer = !!d.series_name || ["serial / series", "series", "serial"].includes(String(d.type || "").toLowerCase().trim());
    return !isSer || !d.series_name;
  });
}

function renderPlaysTabHtml(standalonePlays) {
  let filtered = standalonePlays;
  if (playsSearchTerm) {
    const q = playsSearchTerm.toLowerCase();
    filtered = standalonePlays.filter(p => {
      return p.title.toLowerCase().includes(q) ||
        p.urdu.toLowerCase().includes(q) ||
        p.writer.toLowerCase().includes(q) ||
        p.cast.toLowerCase().includes(q);
    });
  }

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Standalone Long Plays &amp; Telefilms (${standalonePlays.length})</div>
          <div class="panel-sub">Single-part classic dramas, telefilms, and special presentations.</div>
        </div>
        <button class="btn btn-gold" onclick="switchStudioTab('ingest')">+ Ingest Single Play</button>
      </div>

      <div class="search-bar-row">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" id="playsSearchInput" placeholder="Filter single plays…" value="${esc(playsSearchTerm)}">
        </div>
      </div>

      <table class="episodes-table">
        <thead>
          <tr>
            <th style="width:80px">Poster</th>
            <th>Title</th>
            <th>Urdu</th>
            <th>Category</th>
            <th>Year</th>
            <th>Writer / Cast</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length === 0 ? `
            <tr>
              <td colspan="7" style="text-align:center;padding:32px;color:var(--ink-subtle)">
                No standalone plays found matching "${esc(playsSearchTerm)}".
              </td>
            </tr>
          ` : filtered.map(p => {
            const isFeat = configuredFeaturedIds.includes(p.id);
            return `
              <tr>
                <td>
                  <img class="ep-thumb-preview" src="${esc(p.thumbnail_url || '/logo.png')}" alt="" onerror="this.onerror=null; this.src='/logo.png';">
                </td>
                <td>
                  <span style="font-weight:700;color:#fff">${esc(p.title)}</span>
                </td>
                <td>
                  <span style="font-family:var(--font-urdu);color:var(--gold-ptv);font-size:13px">${esc(p.urdu)}</span>
                </td>
                <td><span class="pill pill-gold">${esc(p.type)}</span></td>
                <td><span style="color:var(--ink-subtle)">${esc(p.year || '—')}</span></td>
                <td>
                  <span style="font-size:11px;color:var(--ink-dim)">
                    ${p.writer ? `<b>Writer:</b> ${esc(p.writer)}<br>` : ''}
                    ${p.cast ? `<b>Cast:</b> ${esc(p.cast.slice(0, 40))}` : ''}
                  </span>
                </td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-sm ${isFeat ? 'btn-gold' : 'btn-ghost'}" onclick="toggleHeroFeature(${p.id})">
                    ${isFeat ? '★ Top' : '☆ Top'}
                  </button>
                  <button class="btn btn-ghost btn-sm" onclick="openEditEpisodeModal(${p.id})">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteDramaRecord(${p.id}, '${esc(p.title)}')">✕</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}
