/**
 * Pak Spotlight Vault — add content
 * One paste box: paste a video link (AI fills the details) or a playlist
 * link (import many episodes under one series).
 */

let addMode = "single";        // single | episode
let stagedThumbnailUrl = "";
let plItems = [];
let plPlaylistTitle = "";

function renderAddPane() {
  const seriesNames = buildTitleGroups().filter(g => g.kind === "series").map(g => g.name);

  return `
    <div class="sec">
      <div class="sec-head">
        <div>
          <div class="sec-title">Add from YouTube</div>
          <div class="sec-sub">Paste a single video link, or a playlist link to import a whole serial at once.</div>
        </div>
      </div>

      <div class="add-box">
        <div class="field">
          <label for="addUrlInput">YouTube link</label>
          <div class="add-url-row">
            <input type="url" id="addUrlInput" class="input-url" placeholder="https://www.youtube.com/watch?v=… or /playlist?list=…" autocomplete="off">
            <button class="btn btn-primary" type="button" id="addFetchBtn" onclick="handleAddFetch()" style="min-width:130px">Fetch details</button>
          </div>
          <div class="status" id="addFetchStatus"></div>
        </div>

        <!-- Single video flow -->
        <div id="videoFlow" style="display:none">
          <div class="detected" id="videoDetected"></div>

          <div class="divider-label">What is this video?</div>
          <div class="seg" role="tablist">
            <button type="button" id="segSingle" class="${addMode === 'single' ? 'active' : ''}" onclick="setAddMode('single')">A single title</button>
            <button type="button" id="segEpisode" class="${addMode === 'episode' ? 'active' : ''}" onclick="setAddMode('episode')">An episode of a serial</button>
          </div>

          <form id="singleAddForm">
            <div id="episodeFields" style="display:none; margin-top:14px">
              <div class="form-grid">
                <div class="field">
                  <label for="f_series">Serial</label>
                  <input id="f_series" list="existingSeriesList" placeholder="e.g. Dhoop Kinare">
                  <datalist id="existingSeriesList">
                    ${seriesNames.map(n => `<option value="${esc(n)}"></option>`).join("")}
                  </datalist>
                </div>
                <div class="field">
                  <label for="f_episode">Episode number</label>
                  <input id="f_episode" type="number" min="1" placeholder="e.g. 1">
                </div>
              </div>
            </div>

            <div class="divider-label">Details</div>
            <div class="form-grid">
              <div class="field">
                <label for="f_title">Title</label>
                <input id="f_title" required placeholder="Drama title">
              </div>
              <div class="field">
                <label for="f_urdu">Urdu title</label>
                <input id="f_urdu" class="urdu" placeholder="اردو نام">
              </div>
              <div class="field">
                <label for="f_year">Year</label>
                <input id="f_year" placeholder="e.g. 1987">
              </div>
              <div class="field">
                <label for="f_type">Category</label>
                <select id="f_type">
                  ${configuredCategories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label for="f_writer">Writer</label>
                <input id="f_writer" placeholder="Writer">
              </div>
              <div class="field">
                <label for="f_director">Director</label>
                <input id="f_director" placeholder="Director">
              </div>
              <div class="field full">
                <label for="f_cast">Cast</label>
                <input id="f_cast" placeholder="Actors, comma separated">
              </div>
              <div class="field full">
                <label for="f_produced">Production</label>
                <input id="f_produced" placeholder="e.g. PTV Karachi">
              </div>
              <div class="field full">
                <label for="f_description">Synopsis</label>
                <textarea id="f_description" placeholder="What is this drama about?"></textarea>
              </div>
              <div class="field full">
                <label for="f_customFile">Artwork</label>
                <div class="detected" id="thumbStaging" style="display:none">
                  <img id="thumbStagingImg" src="" alt="">
                  <div class="detected-meta">
                    <div class="detected-title">YouTube thumbnail</div>
                    <div class="detected-sub">Stored automatically. Or upload your own below.</div>
                  </div>
                </div>
                <input type="file" id="f_customFile" accept="image/*" style="font-size:12px; margin-top:8px">
              </div>
            </div>

            <div class="sheet-foot">
              <button type="submit" class="btn btn-primary" id="saveDramaBtn">Add to the vault</button>
            </div>
            <div class="status" id="saveDramaStatus"></div>
          </form>
        </div>

        <!-- Playlist flow -->
        <div id="playlistFlow" style="display:none">
          <div class="detected" id="playlistDetected"></div>

          <div class="divider-label">Videos found</div>
          <div style="display:flex; gap:8px; margin-bottom:4px">
            <button class="btn btn-quiet btn-sm" type="button" onclick="toggleAllPlaylistChecks(true)">Select all</button>
            <button class="btn btn-quiet btn-sm" type="button" onclick="toggleAllPlaylistChecks(false)">Select none</button>
            <span style="flex:1"></span>
            <span style="font-size:12px; color:var(--dim); align-self:center" id="plSelectedCount"></span>
          </div>
          <div class="check-list" id="plItemsListBox"></div>

          <div class="divider-label">Import as</div>
          <div class="form-grid">
            <div class="field">
              <label for="plTarget">Serial</label>
              <select id="plTarget">
                <option value="__new">Create a new serial</option>
                ${seriesNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="plSeriesName">New serial name</label>
              <input id="plSeriesName" placeholder="e.g. Dhoop Kinare">
            </div>
            <div class="field">
              <label for="plCategory">Category</label>
              <select id="plCategory">
                ${configuredCategories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="plUrdu">Urdu title</label>
              <input id="plUrdu" class="urdu" placeholder="اردو نام">
            </div>
            <div class="field">
              <label for="plYear">Year</label>
              <input id="plYear" placeholder="e.g. 1987">
            </div>
            <div class="field">
              <label for="plWriter">Writer</label>
              <input id="plWriter" placeholder="Writer">
            </div>
            <div class="field">
              <label for="plDirector">Director</label>
              <input id="plDirector" placeholder="Director">
            </div>
            <div class="field full">
              <label for="plCast">Cast</label>
              <input id="plCast" placeholder="Actors, comma separated">
            </div>
          </div>
          <p class="hint" style="font-size:11.5px; color:var(--dim); margin-top:10px">
            Credits (writer, director, cast, year) are looked up once and copied to every episode. Videos already in the vault are skipped.
          </p>

          <div class="sheet-foot">
            <button class="btn btn-primary" type="button" id="plImportBtn" onclick="runPlaylistImport()">Import episodes</button>
          </div>
          <div class="status" id="plStatus"></div>
        </div>
      </div>
    </div>
  `;
}

function bindAddEvents() {
  const urlInput = $("addUrlInput");
  if (urlInput) {
    urlInput.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); handleAddFetch(); }
    });
  }

  const form = $("singleAddForm");
  if (form) {
    form.onsubmit = handleSingleAddSubmit;

    const target = $("plTarget");
    if (target) {
      target.addEventListener("change", () => {
        const isNew = target.value === "__new";
        $("plSeriesName").disabled = !isNew;
        if (!isNew) $("plSeriesName").value = target.value;
      });
    }
  }
}

function setAddMode(mode) {
  addMode = mode;
  const s = $("segSingle"), e = $("segEpisode"), box = $("episodeFields");
  if (!s || !e || !box) return;
  s.classList.toggle("active", mode === "single");
  e.classList.toggle("active", mode === "episode");
  box.style.display = mode === "episode" ? "block" : "none";
  if (mode === "single") {
    $("f_series").value = "";
    $("f_episode").value = "";
  }
}

async function handleAddFetch() {
  const url = $("addUrlInput").value.trim();
  const status = $("addFetchStatus");
  const btn = $("addFetchBtn");
  if (!url) {
    status.className = "status show err";
    status.textContent = "Paste a YouTube link first.";
    return;
  }

  btn.disabled = true;

  if (isPlaylistUrl(url)) {
    $("videoFlow").style.display = "none";
    $("playlistFlow").style.display = "none";
    status.className = "status show info";
    status.textContent = "Reading the playlist…";
    try {
      const res = await fetch("/api/playlist-preview", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
        body: JSON.stringify({ url, limit: 50 })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Could not read this playlist.");

      plItems = (data.items || []).map((it, i) => ({ ...it, ep: it.episode || String(i + 1), selected: true }));
      plPlaylistTitle = data.playlist?.title || "";

      $("playlistDetected").innerHTML = `
        <img src="${esc(data.items?.[0]?.thumbnail || '/logo.png')}" alt="" onerror="this.src='/logo.png';">
        <div class="detected-meta">
          <div class="detected-title">${esc(plPlaylistTitle)}</div>
          <div class="detected-sub">${plItems.length} videos in this playlist</div>
        </div>
      `;
      $("plItemsListBox").innerHTML = plItems.map((it, i) => `
        <div class="check-item">
          <input type="checkbox" id="plCheck-${i}" checked onchange="plItems[${i}].selected=this.checked; updatePlCount()">
          <span class="ep-no" style="text-align:center">${esc(it.ep)}</span>
          <img src="${esc(it.thumbnail)}" alt="" loading="lazy" onerror="this.src='/logo.png';">
          <span>${esc(it.title)}</span>
        </div>
      `).join("");

      const suggested = data.suggestedSeries || cleanDramaTitle(plPlaylistTitle);
      $("plTarget").value = "__new";
      $("plSeriesName").disabled = false;
      $("plSeriesName").value = suggested || "";

      $("playlistFlow").style.display = "block";
      status.className = "status show ok";
      status.textContent = `Found ${plItems.length} videos. Review the list, then import.`;
      updatePlCount();
    } catch (err) {
      status.className = "status show err";
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
    return;
  }

  // Single video
  $("playlistFlow").style.display = "none";
  $("videoFlow").style.display = "none";
  status.className = "status show info";
  status.textContent = "AI is checking the video details…";
  try {
    const res = await fetch("/api/ai-autofill", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "AI auto-fill failed.");

    const f = data.fields || {};
    $("videoDetected").innerHTML = `
      <img src="${esc(f.thumbnail || data.video?.thumbnail || '/logo.png')}" alt="" onerror="this.src='/logo.png';">
      <div class="detected-meta">
        <div class="detected-title">${esc(data.video?.title || f.title || 'Video detected')}</div>
        <div class="detected-sub">AI filled the fields below — check them before saving.</div>
      </div>
    `;

    $("f_title").value = f.title || "";
    $("f_urdu").value = f.urdu_title || "";
    $("f_year").value = f.year || "";
    $("f_writer").value = f.writer || "";
    $("f_director").value = f.director || "";
    $("f_produced").value = f.produced || "";
    $("f_cast").value = f.cast || "";
    $("f_description").value = f.description || "";

    if (f.type) {
      const match = configuredCategories.find(c => c.toLowerCase() === f.type.toLowerCase()) || configuredCategories[0];
      $("f_type").value = match;
    }

    // Suggest single vs episode from what the AI found
    const looksLikeEpisode = !!(f.episode_number && f.series_name);
    $("f_series").value = looksLikeEpisode ? (f.series_name || "") : "";
    $("f_episode").value = looksLikeEpisode ? (f.episode_number || "") : "";
    setAddMode(looksLikeEpisode ? "episode" : "single");

    const thumb = f.thumbnail || data.video?.thumbnail;
    stagedThumbnailUrl = thumb || "";
    if (thumb) {
      $("thumbStaging").style.display = "flex";
      $("thumbStagingImg").src = thumb;
    }

    $("videoFlow").style.display = "block";
    status.className = "status show ok";
    status.textContent = data.cached ? "Filled from a cached record of this drama — no AI lookup needed." : "AI filled the details. Review and save.";
  } catch (err) {
    status.className = "status show err";
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

function updatePlCount() {
  const el = $("plSelectedCount");
  if (el) {
    const n = plItems.filter(x => x.selected).length;
    el.textContent = `${n} of ${plItems.length} selected`;
  }
}

function toggleAllPlaylistChecks(checked) {
  plItems.forEach((it, i) => {
    it.selected = checked;
    const cb = $(`plCheck-${i}`);
    if (cb) cb.checked = checked;
  });
  updatePlCount();
}

async function handleSingleAddSubmit(e) {
  e.preventDefault();
  const btn = $("saveDramaBtn");
  const status = $("saveDramaStatus");
  btn.disabled = true;
  status.className = "status show info";
  status.textContent = "Saving…";

  const asEpisode = addMode === "episode";
  if (asEpisode && !$("f_series").value.trim()) {
    status.className = "status show err";
    status.textContent = "Pick which serial this episode belongs to (or switch to a single title).";
    btn.disabled = false;
    return;
  }

  const payload = {
    title: $("f_title").value.trim(),
    urdu_title: $("f_urdu").value.trim(),
    series_name: asEpisode ? ($("f_series").value.trim() || null) : null,
    episode_number: asEpisode && $("f_episode").value ? Number($("f_episode").value) : null,
    year: $("f_year").value.trim(),
    type: $("f_type").value,
    writer: $("f_writer").value.trim(),
    director: $("f_director").value.trim(),
    produced: $("f_produced").value.trim(),
    cast: $("f_cast").value.trim(),
    description: $("f_description").value.trim(),
    youtube_url: $("addUrlInput").value.trim()
  };

  const { data, error } = await window.sbClient.from("Drama").insert(payload).select().single();
  if (error) {
    status.className = "status show err";
    status.textContent = error.message;
    btn.disabled = false;
    return;
  }

  const dramaId = data.id;
  const customFile = $("f_customFile")?.files?.[0];

  try {
    if (customFile) {
      status.textContent = "Uploading artwork…";
      const ext = (customFile.type || "image/jpeg").split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      const storagePath = `drama/${dramaId}.${ext}`;
      const { error: upErr } = await window.sbClient.storage.from("thumbnails").upload(storagePath, customFile, {
        contentType: customFile.type || "image/jpeg",
        upsert: true
      });
      if (!upErr) {
        const pubUrl = window.sbClient.storage.from("thumbnails").getPublicUrl(storagePath).data.publicUrl;
        await window.sbClient.from("Drama").update({ thumbnail_url: pubUrl }).eq("id", dramaId);
      }
    } else if (stagedThumbnailUrl) {
      status.textContent = "Storing artwork…";
      await fetch("/api/store-thumbnail", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
        body: JSON.stringify({ dramaId, imageUrl: stagedThumbnailUrl })
      }).catch(() => {});
    }
  } catch {}

  status.className = "status show ok";
  status.textContent = `"${payload.title}" is in the vault.`;
  vaultToast("Added to the vault");

  // Reset for the next upload
  $("addUrlInput").value = "";
  $("videoFlow").style.display = "none";
  stagedThumbnailUrl = "";
  $("thumbStaging").style.display = "none";
  $("singleAddForm").reset();
  setAddMode("single");
  btn.disabled = false;

  await fetchArchiveData();
  renderPanes();
  syncTabUi();
  switchTab("catalog");
}

async function runPlaylistImport() {
  const url = $("addUrlInput").value.trim();
  const status = $("plStatus");
  const btn = $("plImportBtn");
  const selectedIds = plItems.filter(x => x.selected).map(x => x.id);

  if (!selectedIds.length) {
    status.className = "status show err";
    status.textContent = "Select at least one video to import.";
    return;
  }

  const isNew = $("plTarget").value === "__new";
  const seriesName = isNew ? $("plSeriesName").value.trim() : $("plTarget").value;
  if (!seriesName) {
    status.className = "status show err";
    status.textContent = isNew ? "Name the new serial first." : "Pick a serial to import into.";
    return;
  }

  btn.disabled = true;
  status.className = "status show info";
  status.textContent = `Importing ${selectedIds.length} videos…`;

  try {
    const res = await fetch("/api/playlist-import", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + authSession?.access_token },
      body: JSON.stringify({
        url,
        seriesName,
        category: $("plCategory").value,
        videoIds: selectedIds
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Import failed.");

    status.className = "status show ok";
    status.textContent = `Imported ${data.added} episodes into "${seriesName}". ${data.skipped} were already in the vault.`;
    vaultToast(`Imported ${data.added} episodes`);

    await fetchArchiveData();
    renderPanes();
    expandedKey = normalizeKey(seriesName);
    switchTab("catalog");
  } catch (err) {
    status.className = "status show err";
    status.textContent = err.message;
    btn.disabled = false;
  }
}
