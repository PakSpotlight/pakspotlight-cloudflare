/**
 * Pak Spotlight Admin Studio — Modals (Add Episode, Bulk Edit, Quick Edit, Delete)
 */

function openModal(html) {
  const b = $("studioModalBackdrop");
  const d = $("studioModalDialog");
  if (!b || !d) return;
  d.innerHTML = html;
  b.classList.add("open");
}

function closeModal() {
  const b = $("studioModalBackdrop");
  if (b) b.classList.remove("open");
}

function openAddEpisodeModal(seriesName, nextEp, type, writer, director, cast, year, urdu) {
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">+ Add Episode to ${esc(seriesName)}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form id="addEpisodeForm">
      <div style="background:var(--surface-studio);padding:14px;border-radius:var(--radius-sm);margin-bottom:16px;border:1px solid var(--border-subtle)">
        <label style="display:block;font-size:11px;font-weight:700;color:var(--gold-ptv);margin-bottom:6px">YouTube Episode URL</label>
        <div style="display:flex;gap:10px">
          <input type="url" id="modalEpYtUrl" placeholder="https://www.youtube.com/watch?v=..." required>
          <button type="button" class="btn btn-gold btn-sm" onclick="autoDetectModalEpisode('${esc(seriesName)}')">⚡ Detect</button>
        </div>
        <div class="status-banner" id="modalEpDetectStatus"></div>
      </div>

      <div class="form-grid">
        <div>
          <label>Episode Number *</label>
          <input type="number" id="m_epNum" value="${nextEp}" required>
        </div>
        <div>
          <label>Episode Title *</label>
          <input id="m_title" value="${esc(seriesName)} - Episode ${nextEp}" required>
        </div>
        <div>
          <label>Series Name</label>
          <input id="m_series" value="${esc(seriesName)}" readonly style="opacity:0.8">
        </div>
        <div>
          <label>Urdu Name</label>
          <input id="m_urdu" class="urdu-input" value="${esc(urdu || '')}">
        </div>
        <div>
          <label>Year</label>
          <input id="m_year" value="${esc(year || '')}">
        </div>
        <div>
          <label>Category</label>
          <input id="m_type" value="${esc(type || 'Serial / Series')}" readonly style="opacity:0.8">
        </div>
        <div>
          <label>Writer</label>
          <input id="m_writer" value="${esc(writer || '')}">
        </div>
        <div>
          <label>Director</label>
          <input id="m_director" value="${esc(director || '')}">
        </div>
        <div class="full">
          <label>Cast</label>
          <input id="m_cast" value="${esc(cast || '')}">
        </div>
      </div>

      <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-gold" id="mSaveEpSubmitBtn">Save Episode</button>
      </div>
      <div class="status-banner" id="mSaveEpStatus"></div>
    </form>
  `);

  $("addEpisodeForm").onsubmit = async e => {
    e.preventDefault();
    const stat = $("mSaveEpStatus");
    const btn = $("mSaveEpSubmitBtn");
    btn.disabled = true;
    stat.className = "status-banner show info";
    stat.textContent = "Saving episode…";

    const ytUrl = $("modalEpYtUrl").value.trim();
    const epNum = Number($("m_epNum").value);
    const title = $("m_title").value.trim();

    const payload = {
      title,
      urdu_title: $("m_urdu").value.trim(),
      series_name: seriesName,
      episode_number: epNum,
      year: $("m_year").value.trim(),
      type: $("m_type").value,
      writer: $("m_writer").value.trim(),
      director: $("m_director").value.trim(),
      cast: $("m_cast").value.trim(),
      youtube_url: ytUrl
    };

    const { data, error } = await window.sbClient.from("Drama").insert(payload).select().single();
    if (error) {
      stat.className = "status-banner show err";
      stat.textContent = error.message;
      btn.disabled = false;
    } else {
      if (data?.id && ytUrl) {
        fetch(`/api/store-thumbnail`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": "Bearer " + authSession?.access_token
          },
          body: JSON.stringify({ dramaId: data.id, imageUrl: `https://i.ytimg.com/vi/${extractYouTubeId(ytUrl)}/hqdefault.jpg` })
        }).catch(() => {});
      }
      closeModal();
      await fetchArchiveData();
      renderStudioDashboard();
    }
  };
}

async function autoDetectModalEpisode(seriesName) {
  const url = $("modalEpYtUrl").value.trim();
  const status = $("modalEpDetectStatus");
  if (!url) return;
  status.className = "status-banner show info";
  status.textContent = "Detecting episode number…";
  try {
    const res = await fetch("/api/identify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + authSession?.access_token
      },
      body: JSON.stringify({ url })
    });
    const v = await res.json();
    const ep = parseEpisodeNumber(v.title, v.description);
    if (ep) {
      $("m_epNum").value = ep;
      $("m_title").value = `${seriesName} - Episode ${ep}`;
    }
    status.className = "status-banner show ok";
    status.textContent = `Found: ${v.title}`;
  } catch (err) {
    status.className = "status-banner show err";
    status.textContent = err.message;
  }
}

function openBulkEditModal(seriesName) {
  const series = getSeriesGroups().find(s => s.name.toLowerCase() === seriesName.toLowerCase());
  if (!series) return;
  const rep = series.rep || {};

  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">✎ Bulk Edit: ${esc(seriesName)}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:12px;color:var(--ink-subtle);margin-bottom:16px">
      Updates writer, director, cast, year, or category across all <b>${series.episodes.length} episodes</b> at once.
    </p>
    <form id="bulkEditForm">
      <div class="form-grid">
        <div>
          <label>Series Name *</label>
          <input id="b_series" value="${esc(seriesName)}" required>
        </div>
        <div>
          <label>Urdu Name</label>
          <input id="b_urdu" class="urdu-input" value="${esc(rep.urdu || '')}">
        </div>
        <div>
          <label>Year</label>
          <input id="b_year" value="${esc(rep.year || '')}">
        </div>
        <div>
          <label>Category</label>
          <select id="b_type">
            ${configuredCategories.map(c => `<option value="${esc(c)}" ${rep.type === c ? 'selected' : ''}>${esc(c)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Writer</label>
          <input id="b_writer" value="${esc(rep.writer || '')}">
        </div>
        <div>
          <label>Director</label>
          <input id="b_director" value="${esc(rep.director || '')}">
        </div>
        <div class="full">
          <label>Star Cast</label>
          <input id="b_cast" value="${esc(rep.cast || '')}">
        </div>
      </div>

      <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-gold" id="bSubmitBtn">Apply to All ${series.episodes.length} Episodes</button>
      </div>
      <div class="status-banner" id="bStatus"></div>
    </form>
  `);

  $("bulkEditForm").onsubmit = async e => {
    e.preventDefault();
    const stat = $("bStatus");
    const btn = $("bSubmitBtn");
    btn.disabled = true;
    stat.className = "status-banner show info";
    stat.textContent = `Applying updates across ${series.episodes.length} episodes…`;

    const newSeries = $("b_series").value.trim();
    const payload = {
      series_name: newSeries,
      urdu_title: $("b_urdu").value.trim(),
      year: $("b_year").value.trim(),
      type: $("b_type").value,
      writer: $("b_writer").value.trim(),
      director: $("b_director").value.trim(),
      cast: $("b_cast").value.trim()
    };

    const epIds = series.episodes.map(ep => ep.id);
    const { error } = await window.sbClient.from("Drama").update(payload).in("id", epIds);

    if (error) {
      stat.className = "status-banner show err";
      stat.textContent = error.message;
      btn.disabled = false;
    } else {
      closeModal();
      await fetchArchiveData();
      renderStudioDashboard();
    }
  };
}

function openEditEpisodeModal(id) {
  const d = allDramas.find(x => x.id === id);
  if (!d) return;

  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">Edit Record: ${esc(d.title)}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form id="editRecordForm">
      <div class="form-grid">
        <div class="full">
          <label>Title *</label>
          <input id="e_title" value="${esc(d.title)}" required>
        </div>
        <div>
          <label>Series Name</label>
          <input id="e_series" value="${esc(d.series_name || '')}">
        </div>
        <div>
          <label>Episode Number</label>
          <input id="e_episode" type="number" value="${d.episode_number ?? ''}">
        </div>
        <div>
          <label>Urdu Title</label>
          <input id="e_urdu" class="urdu-input" value="${esc(d.urdu)}">
        </div>
        <div>
          <label>Year</label>
          <input id="e_year" value="${esc(d.year)}">
        </div>
        <div>
          <label>Category</label>
          <select id="e_type">
            ${configuredCategories.map(c => `<option value="${esc(c)}" ${d.type === c ? 'selected' : ''}>${esc(c)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Writer</label>
          <input id="e_writer" value="${esc(d.writer)}">
        </div>
        <div>
          <label>Director</label>
          <input id="e_director" value="${esc(d.director)}">
        </div>
        <div class="full">
          <label>Star Cast</label>
          <input id="e_cast" value="${esc(d.cast)}">
        </div>
        <div class="full">
          <label>YouTube Link</label>
          <input id="e_youtube" type="url" value="${esc(d.youtube_url)}">
        </div>
        <div class="full">
          <label>Thumbnail Public URL</label>
          <input id="e_thumb" type="url" value="${esc(d.thumbnail_url)}">
        </div>
      </div>

      <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-gold" id="eSubmitBtn">Save Changes</button>
      </div>
      <div class="status-banner" id="eStatus"></div>
    </form>
  `);

  $("editRecordForm").onsubmit = async e => {
    e.preventDefault();
    const stat = $("eStatus");
    const btn = $("eSubmitBtn");
    btn.disabled = true;
    stat.className = "status-banner show info";
    stat.textContent = "Saving changes…";

    const payload = {
      title: $("e_title").value.trim(),
      series_name: $("e_series").value.trim() || null,
      episode_number: $("e_episode").value ? Number($("e_episode").value) : null,
      urdu_title: $("e_urdu").value.trim(),
      year: $("e_year").value.trim(),
      type: $("e_type").value,
      writer: $("e_writer").value.trim(),
      director: $("e_director").value.trim(),
      cast: $("e_cast").value.trim(),
      youtube_url: $("e_youtube").value.trim(),
      thumbnail_url: $("e_thumb").value.trim()
    };

    const { error } = await window.sbClient.from("Drama").update(payload).eq("id", id);
    if (error) {
      stat.className = "status-banner show err";
      stat.textContent = error.message;
      btn.disabled = false;
    } else {
      closeModal();
      await fetchArchiveData();
      renderStudioDashboard();
    }
  };
}

async function deleteDramaRecord(id, title) {
  if (!confirm(`Are you sure you want to delete "${title}" from the archive?`)) return;
  const { error } = await window.sbClient.from("Drama").delete().eq("id", id);
  if (error) {
    alert("Delete failed: " + error.message);
  } else {
    await fetchArchiveData();
    renderStudioDashboard();
  }
}
