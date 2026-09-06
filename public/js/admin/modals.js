/**
 * Pak Spotlight Vault — sheets (dialogs), action menus, deletes, toast
 */

function openModal(html) {
  const b = $("studioModalBackdrop");
  const d = $("studioModalDialog");
  if (!b || !d) return;
  d.innerHTML = html;
  b.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const b = $("studioModalBackdrop");
  if (!b) return;
  b.classList.remove("open");
  document.body.style.overflow = "";
}

function handleBackdropClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

// ----------------------------------------------------
// TOAST
// ----------------------------------------------------
let toastTimer = null;
function vaultToast(msg) {
  let el = $("vaultToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "vaultToast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

// ----------------------------------------------------
// MOBILE ACTION MENU (row kebab)
// ----------------------------------------------------
function openTitleActionSheet(g) {
  const isSeries = g.kind === "series";
  const items = [
    { act: "watch", label: "Watch on site", icon: "external" },
    g.pinned
      ? { act: "unpin", label: "Remove from spotlight", icon: "pinFilled" }
      : { act: "pin", label: "Pin to home spotlight", icon: "pin" },
    isSeries
      ? { act: "edit", label: "Edit series", icon: "pencil" }
      : { act: "edit", label: "Edit details", icon: "pencil" },
    ...(isSeries ? [{ act: "add-ep", label: "Add episode", icon: "plus" }] : []),
    ...(isSeries ? [{ act: "import-pl", label: "Import playlist", icon: "import" }] : []),
    { act: "delete", label: isSeries ? `Delete series (${g.episodes.length} episodes)` : "Delete title", icon: "trash", danger: true }
  ];

  openModal(`
    <div class="sheet sheet-menu">
      <div class="sheet-head">
        <div class="sheet-title">${esc(g.name)}</div>
        <button class="ibtn" type="button" onclick="closeModal()" title="Close">${icon('close')}</button>
      </div>
      ${items.map(it => `
        <button type="button" data-sheet-act="${it.act}" class="${it.danger ? 'danger' : ''}">
          ${icon(it.icon)}<span>${esc(it.label)}</span>
        </button>
      `).join("")}
    </div>
  `);

  $("studioModalDialog").querySelectorAll("[data-sheet-act]").forEach(btn => {
    btn.onclick = () => {
      const act = btn.dataset.sheetAct;
      closeModal();
      if (act === "watch") window.open(`/watch.html?id=${g.firstId}`, "_blank");
      else if (act === "pin" || act === "unpin") toggleHeroFeature(g);
      else if (act === "edit") g.kind === "series" ? openSeriesEditModal(g.name) : openEditRecordModal(g.episodes[0].id);
      else if (act === "add-ep") openAddEpisodeModal(g.name);
      else if (act === "import-pl") openSeriesImportModal(g.name);
      else if (act === "delete") g.kind === "series" ? deleteSeries(g.name) : deleteDramaRecord(g.episodes[0].id, g.name);
    };
  });
}

// ----------------------------------------------------
// EDIT A SINGLE RECORD (episode or standalone title)
// ----------------------------------------------------
function openEditRecordModal(id) {
  const d = allDramas.find(x => x.id === id);
  if (!d) return;

  openModal(`
    <div class="sheet" style="max-width:640px">
      <div class="sheet-head">
        <div class="sheet-title">Edit record</div>
        <button class="ibtn" type="button" onclick="closeModal()" title="Close">${icon('close')}</button>
      </div>
      <form id="editRecordForm">
        <div class="form-grid">
          <div class="field full">
            <label for="e_title">Title</label>
            <input id="e_title" value="${esc(d.title)}" required>
          </div>
          <div class="field">
            <label for="e_series">Serial name <span style="font-weight:400">(empty makes it a single title)</span></label>
            <input id="e_series" value="${esc(d.series_name || '')}" list="existingSeriesList">
          </div>
          <div class="field">
            <label for="e_episode">Episode number</label>
            <input id="e_episode" type="number" min="1" value="${d.episode_number ?? ''}">
          </div>
          <div class="field">
            <label for="e_urdu">Urdu title</label>
            <input id="e_urdu" class="urdu" value="${esc(d.urdu)}">
          </div>
          <div class="field">
            <label for="e_year">Year</label>
            <input id="e_year" value="${esc(d.year)}">
          </div>
          <div class="field">
            <label for="e_type">Category</label>
            <select id="e_type">
              ${configuredCategories.map(c => `<option value="${esc(c)}" ${d.type === c ? 'selected' : ''}>${esc(c)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="e_writer">Writer</label>
            <input id="e_writer" value="${esc(d.writer)}">
          </div>
          <div class="field">
            <label for="e_director">Director</label>
            <input id="e_director" value="${esc(d.director)}">
          </div>
          <div class="field full">
            <label for="e_cast">Cast</label>
            <input id="e_cast" value="${esc(d.cast)}">
          </div>
          <div class="field full">
            <label for="e_youtube">YouTube link</label>
            <input id="e_youtube" type="url" value="${esc(d.youtube_url)}">
          </div>
          <div class="field full">
            <label for="e_thumb">Artwork URL</label>
            <input id="e_thumb" type="url" value="${esc(d.thumbnail_url)}">
          </div>
        </div>

        <div class="sheet-foot">
          <button type="button" class="btn btn-danger left" onclick="deleteDramaRecord(${d.id}, '${esc(d.title)}', '${esc(d.series_name || '')}')">Delete</button>
          <button type="button" class="btn btn-quiet" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="eSubmitBtn">Save changes</button>
        </div>
        <div class="status" id="eStatus"></div>
      </form>
    </div>
  `);

  $("editRecordForm").onsubmit = async e => {
    e.preventDefault();
    const stat = $("eStatus");
    const btn = $("eSubmitBtn");
    btn.disabled = true;
    stat.className = "status show info";
    stat.textContent = "Saving…";

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
      stat.className = "status show err";
      stat.textContent = error.message;
      btn.disabled = false;
      return;
    }
    closeModal();
    vaultToast("Changes saved");
    await refreshApp();
  };
}

// ----------------------------------------------------
// EDIT SERIES METADATA (applies across all episodes)
// ----------------------------------------------------
function openSeriesEditModal(seriesName) {
  const g = buildTitleGroups().find(x => x.kind === "series" && normalizeKey(x.name) === normalizeKey(seriesName));
  if (!g) return;
  const rep = g.rep;

  openModal(`
    <div class="sheet" style="max-width:640px">
      <div class="sheet-head">
        <div class="sheet-title">Edit serial<span class="urdu">${esc(rep.urdu || '')}</span></div>
        <button class="ibtn" type="button" onclick="closeModal()" title="Close">${icon('close')}</button>
      </div>
      <p style="font-size:12.5px; color:var(--muted); margin-bottom:14px">
        Changes apply to all ${g.episodes.length} episodes of ${esc(g.name)}.
      </p>
      <form id="seriesEditForm">
        <div class="form-grid">
          <div class="field">
            <label for="b_series">Serial name</label>
            <input id="b_series" value="${esc(g.name)}" required>
          </div>
          <div class="field">
            <label for="b_urdu">Urdu title</label>
            <input id="b_urdu" class="urdu" value="${esc(rep.urdu || '')}">
          </div>
          <div class="field">
            <label for="b_year">Year</label>
            <input id="b_year" value="${esc(rep.year || '')}">
          </div>
          <div class="field">
            <label for="b_type">Category</label>
            <select id="b_type">
              ${configuredCategories.map(c => `<option value="${esc(c)}" ${rep.type === c ? 'selected' : ''}>${esc(c)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="b_writer">Writer</label>
            <input id="b_writer" value="${esc(rep.writer || '')}">
          </div>
          <div class="field">
            <label for="b_director">Director</label>
            <input id="b_director" value="${esc(rep.director || '')}">
          </div>
          <div class="field full">
            <label for="b_cast">Cast</label>
            <input id="b_cast" value="${esc(rep.cast || '')}">
          </div>
        </div>

        <div class="sheet-foot">
          <button type="button" class="btn btn-danger left" onclick="deleteSeries('${esc(g.name)}')">Delete serial</button>
          <button type="button" class="btn btn-quiet" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="bSubmitBtn">Save to all episodes</button>
        </div>
        <div class="status" id="bStatus"></div>
      </form>
    </div>
  `);

  $("seriesEditForm").onsubmit = async e => {
    e.preventDefault();
    const stat = $("bStatus");
    const btn = $("bSubmitBtn");
    btn.disabled = true;
    stat.className = "status show info";
    stat.textContent = `Updating ${g.episodes.length} episodes…`;

    const newName = $("b_series").value.trim();
    const payload = {
      series_name: newName,
      urdu_title: $("b_urdu").value.trim(),
      year: $("b_year").value.trim(),
      type: $("b_type").value,
      writer: $("b_writer").value.trim(),
      director: $("b_director").value.trim(),
      cast: $("b_cast").value.trim()
    };

    const epIds = g.episodes.map(ep => ep.id);
    const { error } = await window.sbClient.from("Drama").update(payload).in("id", epIds);
    if (error) {
      stat.className = "status show err";
      stat.textContent = error.message;
      btn.disabled = false;
      return;
    }
    closeModal();
    vaultToast("Serial updated");
    expandedKey = normalizeKey(newName);
    await refreshApp();
  };
}

// ----------------------------------------------------
// ADD ONE EPISODE TO A SERIAL
// ----------------------------------------------------
function openAddEpisodeModal(seriesName) {
  const g = buildTitleGroups().find(x => x.kind === "series" && normalizeKey(x.name) === normalizeKey(seriesName));
  if (!g) return;
  const rep = g.rep;
  const maxEp = Math.max(...g.episodes.map(e => e.episode_number || 0), 0);
  const nextEp = maxEp + 1;

  openModal(`
    <div class="sheet" style="max-width:560px">
      <div class="sheet-head">
        <div class="sheet-title">Add episode to ${esc(g.name)}</div>
        <button class="ibtn" type="button" onclick="closeModal()" title="Close">${icon('close')}</button>
      </div>
      <form id="addEpisodeForm">
        <div class="field" style="margin-bottom:14px">
          <label for="modalEpYtUrl">YouTube link</label>
          <div class="add-url-row">
            <input type="url" id="modalEpYtUrl" placeholder="https://www.youtube.com/watch?v=…" required>
            <button type="button" class="btn btn-quiet" onclick="autoDetectModalEpisode('${esc(g.name)}')" style="min-width:96px">Detect</button>
          </div>
          <div class="status" id="modalEpDetectStatus"></div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="m_epNum">Episode number</label>
            <input type="number" id="m_epNum" value="${nextEp}" min="1" required>
          </div>
          <div class="field">
            <label for="m_title">Episode title</label>
            <input id="m_title" value="${esc(g.name)} — Episode ${nextEp}" required>
          </div>
        </div>

        <div class="sheet-foot">
          <button type="button" class="btn btn-quiet" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="mSaveEpSubmitBtn">Add episode</button>
        </div>
        <div class="status" id="mSaveEpStatus"></div>
      </form>
    </div>
  `);

  $("modalEpYtUrl").focus();

  $("addEpisodeForm").onsubmit = async e => {
    e.preventDefault();
    const stat = $("mSaveEpStatus");
    const btn = $("mSaveEpSubmitBtn");
    btn.disabled = true;
    stat.className = "status show info";
    stat.textContent = "Saving episode…";

    const ytUrl = $("modalEpYtUrl").value.trim();
    const epNum = Number($("m_epNum").value) || nextEp;
    const yId = extractYouTubeId(ytUrl);
    const thumb = yId ? `https://i.ytimg.com/vi/${yId}/hqdefault.jpg` : "";

    const payload = {
      title: $("m_title").value.trim(),
      urdu_title: rep.urdu || "",
      series_name: g.name,
      episode_number: epNum,
      year: rep.year || "",
      type: rep.type || "Serial / Series",
      writer: rep.writer || "",
      director: rep.director || "",
      cast: rep.cast || "",
      youtube_url: ytUrl,
      thumbnail_url: thumb
    };

    const { data, error } = await window.sbClient.from("Drama").insert(payload).select().single();
    if (error) {
      stat.className = "status show err";
      stat.textContent = error.message;
      btn.disabled = false;
      return;
    }

    if (data?.id && thumb) {
      fetch("/api/store-thumbnail", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
        body: JSON.stringify({ dramaId: data.id, imageUrl: thumb })
      }).catch(() => {});
    }

    closeModal();
    vaultToast(`Episode ${epNum} added`);
    expandedKey = normalizeKey(g.name);
    await refreshApp();
  };
}

async function autoDetectModalEpisode(seriesName) {
  const url = $("modalEpYtUrl").value.trim();
  const status = $("modalEpDetectStatus");
  if (!url) return;
  status.className = "status show info";
  status.textContent = "Reading the video…";
  try {
    const res = await fetch("/api/identify", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
      body: JSON.stringify({ url })
    });
    const v = await res.json();
    if (!res.ok || v.error) throw new Error(v.error || "Could not read this video.");
    const ep = parseEpisodeNumber(v.title, v.description);
    if (ep) {
      $("m_epNum").value = ep;
      $("m_title").value = `${seriesName} — Episode ${ep}`;
    }
    status.className = "status show ok";
    status.textContent = `Found: ${v.title}`;
  } catch (err) {
    status.className = "status show err";
    status.textContent = err.message;
  }
}

// ----------------------------------------------------
// IMPORT A PLAYLIST INTO AN EXISTING SERIAL
// ----------------------------------------------------
function openSeriesImportModal(seriesName) {
  const g = buildTitleGroups().find(x => x.kind === "series" && normalizeKey(x.name) === normalizeKey(seriesName));
  if (!g) return;

  openModal(`
    <div class="sheet" style="max-width:560px">
      <div class="sheet-head">
        <div class="sheet-title">Import playlist into ${esc(g.name)}</div>
        <button class="ibtn" type="button" onclick="closeModal()" title="Close">${icon('close')}</button>
      </div>
      <form id="seriesPlForm">
        <div class="field">
          <label for="seriesPlUrl">YouTube playlist link</label>
          <div class="add-url-row">
            <input type="url" id="seriesPlUrl" placeholder="https://www.youtube.com/playlist?list=…" required>
            <button type="submit" class="btn btn-primary" id="seriesPlSubmitBtn" style="min-width:110px">Import</button>
          </div>
          <p class="hint" style="margin-top:6px">Every video becomes an episode of ${esc(g.name)}. Videos already in the vault are skipped.</p>
        </div>
        <div class="status" id="seriesPlStatus"></div>
      </form>
    </div>
  `);

  $("seriesPlUrl").focus();

  $("seriesPlForm").onsubmit = async e => {
    e.preventDefault();
    const url = $("seriesPlUrl").value.trim();
    const status = $("seriesPlStatus");
    const btn = $("seriesPlSubmitBtn");
    if (!url) return;

    btn.disabled = true;
    status.className = "status show info";
    status.textContent = "Importing playlist…";

    try {
      const res = await fetch("/api/playlist-import", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
        body: JSON.stringify({ url, seriesName: g.name, category: g.rep.type })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Import failed");

      closeModal();
      vaultToast(`Imported ${data.added} episodes into ${g.name}`);
      expandedKey = normalizeKey(g.name);
      await refreshApp();
    } catch (err) {
      status.className = "status show err";
      status.textContent = err.message;
      btn.disabled = false;
    }
  };
}

// ----------------------------------------------------
// DELETES
// ----------------------------------------------------
async function deleteDramaRecord(id, title, seriesName = "") {
  if (!confirm(`Delete "${title}" from the vault?`)) return;
  const { error } = await window.sbClient.from("Drama").delete().eq("id", id);
  if (error) {
    vaultToast("Delete failed: " + error.message);
    return;
  }
  closeModal();
  vaultToast("Deleted from the vault");
  await refreshApp();
}

async function deleteSeries(seriesName) {
  const g = buildTitleGroups().find(x => x.kind === "series" && normalizeKey(x.name) === normalizeKey(seriesName));
  if (!g) return;
  const n = g.episodes.length;
  if (!confirm(`Delete the whole serial "${seriesName}" — ${n} episode${n !== 1 ? 's' : ''}? This cannot be undone.`)) return;

  const ids = g.episodes.map(e => e.id);
  const { error } = await window.sbClient.from("Drama").delete().in("id", ids);
  if (error) {
    vaultToast("Delete failed: " + error.message);
    return;
  }
  closeModal();
  expandedKey = null;
  vaultToast(`Deleted ${seriesName}`);
  await refreshApp();
}
