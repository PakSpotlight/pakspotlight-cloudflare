/**
 * Pak Spotlight Admin Studio — Ingestion Studio (YouTube Search, AI Auto-Fill, Playlist Importer)
 */

let activeIngestSubtab = "ytsearch";
let ytSearchResults = [];
let stagedThumbnailUrl = "";
let plItems = [];

function renderIngestTabHtml() {
  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Content Ingestion &amp; AI Studio</div>
          <div class="panel-sub">Three fast paths to add content: Search YouTube in-app, use AI Auto-Fill, or batch-import playlists.</div>
        </div>
      </div>

      <div class="ingest-subtabs-nav">
        <button class="ingest-tab-btn ${activeIngestSubtab === 'ytsearch' ? 'active' : ''}" onclick="switchIngestSubtab('ytsearch')">
          🔍 Direct YouTube Search
        </button>
        <button class="ingest-tab-btn ${activeIngestSubtab === 'autofill' ? 'active' : ''}" onclick="switchIngestSubtab('autofill')">
          ⚡ Single Video AI Auto-Fill
        </button>
        <button class="ingest-tab-btn ${activeIngestSubtab === 'playlist' ? 'active' : ''}" onclick="switchIngestSubtab('playlist')">
          📑 Whole Playlist Importer
        </button>
      </div>

      <!-- SUB-TAB 1: In-App YouTube Search -->
      <div id="subtab-ytsearch" style="${activeIngestSubtab === 'ytsearch' ? '' : 'display:none'}">
        <p style="font-size:13px;color:var(--ink-subtle);margin-bottom:14px">
          Search the Pak Spotlight YouTube archive (@pkspotlight) directly without leaving this page. Click <b>Auto-Fill</b> to immediately import with full AI-generated metadata.
        </p>
        <div style="display:flex;gap:10px">
          <input type="text" id="ytSearchQuery" placeholder="e.g. Dhoop Kinare, Ankahi, Waris, Tanhaiyaan..." onkeydown="if(event.key==='Enter') runYouTubeSearch()">
          <button class="btn btn-gold" id="ytSearchBtn" onclick="runYouTubeSearch()">Search YouTube</button>
        </div>
        <div class="status-banner" id="ytSearchStatus"></div>
        <div class="yt-search-results-grid" id="ytSearchResultsGrid">
          ${ytSearchResults.map(item => `
            <div class="yt-search-card">
              <img class="yt-search-thumb" src="${esc(item.thumbnail)}" alt="${esc(item.title)}" onerror="this.onerror=null; this.src='/logo.png';">
              <div class="yt-search-body">
                <span class="yt-search-title">${esc(item.title)}</span>
                <span class="yt-search-meta">Uploaded: ${esc(item.publishedAt?.slice(0, 10) || 'Classic')}</span>
                <div class="yt-search-actions">
                  <button class="btn btn-gold btn-sm" style="flex:1" onclick="useYtSearchResultForAutofill('${esc(item.id)}', '${esc(item.title)}')">
                    ⚡ Auto-Fill This
                  </button>
                  <a class="btn btn-ghost btn-sm" href="https://www.youtube.com/watch?v=${esc(item.id)}" target="_blank">YT ↗</a>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- SUB-TAB 2: Single Video AI Auto-Fill Form -->
      <div id="subtab-autofill" style="${activeIngestSubtab === 'autofill' ? '' : 'display:none'}">
        <form id="singleIngestForm">
          <div style="background:var(--surface-studio);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);margin-bottom:20px">
            <label style="display:block;font-size:12px;font-weight:700;color:var(--gold-ptv);margin-bottom:8px">1. Paste YouTube Video Link</label>
            <div style="display:flex;gap:10px">
              <input type="url" id="aiVideoUrl" placeholder="https://www.youtube.com/watch?v=...">
              <button type="button" class="btn btn-gold" id="aiAutofillBtn" onclick="runSingleAiAutofill()">⚡ Fill with AI</button>
            </div>
            <div class="status-banner" id="aiAutofillStatus"></div>
          </div>

          <div class="form-grid">
            <div>
              <label>Title *</label>
              <input id="f_title" required placeholder="Drama or Episode title">
            </div>
            <div>
              <label>Urdu Title (اردو نام)</label>
              <input id="f_urdu" class="urdu-input" placeholder="اردو نام">
            </div>
            <div>
              <label>Series Name (for grouping episodes together)</label>
              <input id="f_series" placeholder="e.g. Dhoop Kinare (leave blank for standalone plays)">
            </div>
            <div>
              <label>Episode Number</label>
              <input id="f_episode" type="number" min="1" placeholder="e.g. 1">
            </div>
            <div>
              <label>Release Year</label>
              <input id="f_year" placeholder="e.g. 1987">
            </div>
            <div>
              <label>Category Group</label>
              <select id="f_type">
                ${configuredCategories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>Writer</label>
              <input id="f_writer" placeholder="Writer name">
            </div>
            <div>
              <label>Director</label>
              <input id="f_director" placeholder="Director name">
            </div>
            <div class="full">
              <label>Star Cast</label>
              <input id="f_cast" placeholder="Actors separated by commas">
            </div>
            <div class="full">
              <label>PTV Center / Production</label>
              <input id="f_produced" placeholder="e.g. PTV Lahore / PTV Karachi">
            </div>
            <div class="full">
              <label>About / Synopsis</label>
              <textarea id="f_description" placeholder="Synopsis of this drama or episode…"></textarea>
            </div>
            <div class="full">
              <label>YouTube URL</label>
              <input id="f_youtube" type="url" placeholder="https://www.youtube.com/watch?v=...">
            </div>
            <div class="full">
              <label>Artwork / Thumbnail</label>
              <div class="thumb-staging-card" id="thumbStagingBox" style="display:none">
                <img class="thumb-staging-preview" id="thumbStagingImg" src="" alt="Thumbnail Preview">
                <div>
                  <div style="font-weight:700;font-size:13px;color:#fff" id="thumbStagingTitle">YouTube Thumbnail Detected</div>
                  <div style="font-size:11px;color:var(--ink-subtle)">Will be automatically uploaded to Supabase Storage on save.</div>
                </div>
              </div>
              <div style="margin-top:10px">
                <input type="file" id="f_customFile" accept="image/*" style="font-size:12px">
              </div>
            </div>
          </div>

          <div style="margin-top:24px;display:flex;gap:12px;align-items:center">
            <button type="submit" class="btn btn-gold" id="saveDramaSubmitBtn">Save to Archive</button>
            <div class="status-banner" id="saveDramaStatus" style="margin:0"></div>
          </div>
        </form>
      </div>

      <!-- SUB-TAB 3: Whole Playlist Wizard -->
      <div id="subtab-playlist" style="${activeIngestSubtab === 'playlist' ? '' : 'display:none'}">
        <div style="background:var(--surface-studio);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);margin-bottom:20px">
          <label style="display:block;font-size:12px;font-weight:700;color:var(--gold-ptv);margin-bottom:8px">Paste YouTube Playlist URL</label>
          <div style="display:flex;gap:10px">
            <input type="url" id="plInputUrl" placeholder="https://www.youtube.com/playlist?list=...">
            <button type="button" class="btn btn-gold" id="plPreviewBtn" onclick="runPlaylistPreview()">See Videos</button>
          </div>
          <div class="status-banner" id="plStatusMsgTop"></div>
        </div>

        <div id="plWizardContent" style="display:none">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <span style="font-size:14px;font-weight:700;color:#fff" id="plEpisodesHeaderTitle">Episodes Detected</span>
            <div style="display:flex;gap:8px">
              <button class="btn btn-ghost btn-sm" onclick="toggleAllPlaylistChecks(true)">Select All</button>
              <button class="btn btn-ghost btn-sm" onclick="toggleAllPlaylistChecks(false)">Select None</button>
            </div>
          </div>
          <div style="max-height:300px;overflow-y:auto;background:var(--surface-studio);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:10px;margin-bottom:20px" id="plItemsListBox"></div>

          <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:12px">Series Information (Shared by all episodes)</div>
          <div class="form-grid" style="margin-bottom:20px">
            <div>
              <label>Drama Series Name *</label>
              <input id="plSeriesName" required>
            </div>
            <div>
              <label>Urdu Name (اردو نام)</label>
              <input id="plUrduName" class="urdu-input">
            </div>
            <div>
              <label>Year</label>
              <input id="plYear">
            </div>
            <div>
              <label>Category</label>
              <select id="plCategory">
                ${configuredCategories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>Writer</label>
              <input id="plWriter">
            </div>
            <div>
              <label>Director</label>
              <input id="plDirector">
            </div>
            <div class="full">
              <label>Star Cast</label>
              <input id="plCast">
            </div>
          </div>

          <div style="display:flex;gap:12px;align-items:center">
            <button class="btn btn-gold" id="plStartImportBtn" onclick="runPlaylistBatchImport()">Add to Archive</button>
            <div class="status-banner" id="plBatchStatus" style="margin:0"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function switchIngestSubtab(subtab) {
  activeIngestSubtab = subtab;
  document.querySelectorAll(".ingest-tab-btn").forEach(b => {
    b.classList.toggle("active", (subtab === 'ytsearch' && b.textContent.includes('Search')) || (subtab === 'autofill' && b.textContent.includes('Single')) || (subtab === 'playlist' && b.textContent.includes('Playlist')));
  });
  const yBox = $('subtab-ytsearch');
  const aBox = $('subtab-autofill');
  const pBox = $('subtab-playlist');
  if (yBox) yBox.style.display = subtab === 'ytsearch' ? 'block' : 'none';
  if (aBox) aBox.style.display = subtab === 'autofill' ? 'block' : 'none';
  if (pBox) pBox.style.display = subtab === 'playlist' ? 'block' : 'none';
}

async function runYouTubeSearch() {
  const q = $("ytSearchQuery").value.trim();
  const status = $("ytSearchStatus");
  const btn = $("ytSearchBtn");
  if (!q) return;

  btn.disabled = true;
  status.className = "status-banner show info";
  status.textContent = "Searching YouTube archive…";

  try {
    const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(q)}`, {
      headers: { "authorization": "Bearer " + authSession?.access_token }
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Search failed");
    ytSearchResults = data.items || [];
    status.className = "status-banner show ok";
    status.textContent = `Found ${ytSearchResults.length} videos. Click "Auto-Fill This" on any item to ingest.`;
    renderStudioDashboard();
    switchStudioTab('ingest');
    switchIngestSubtab('ytsearch');
  } catch (err) {
    status.className = "status-banner show err";
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

function useYtSearchResultForAutofill(ytId, title) {
  switchIngestSubtab("autofill");
  const url = `https://www.youtube.com/watch?v=${ytId}`;
  const input = $("aiVideoUrl");
  if (input) input.value = url;
  runSingleAiAutofill();
}

async function runSingleAiAutofill() {
  const url = $("aiVideoUrl").value.trim();
  const status = $("aiAutofillStatus");
  const btn = $("aiAutofillBtn");
  if (!url) return;

  btn.disabled = true;
  status.className = "status-banner show info";
  status.textContent = "AI is inspecting video metadata & web records…";

  try {
    const res = await fetch("/api/ai-autofill", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + authSession?.access_token
      },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "AI Auto-fill failed");

    const f = data.fields || {};
    $("f_title").value = f.title || "";
    $("f_urdu").value = f.urdu_title || "";
    $("f_series").value = f.series_name || cleanDramaTitle(f.title) || "";
    $("f_episode").value = f.episode_number || "";
    $("f_year").value = f.year || "";
    $("f_writer").value = f.writer || "";
    $("f_director").value = f.director || "";
    $("f_produced").value = f.produced || "";
    $("f_cast").value = f.cast || "";
    $("f_description").value = f.description || "";
    $("f_youtube").value = url;

    if (f.type && $("f_type")) {
      const match = configuredCategories.find(c => c.toLowerCase() === f.type.toLowerCase()) || configuredCategories[0];
      $("f_type").value = match;
    }

    const thumb = f.thumbnail || data.video?.thumbnail;
    if (thumb) {
      stagedThumbnailUrl = thumb;
      $("thumbStagingBox").style.display = "flex";
      $("thumbStagingImg").src = thumb;
    }

    status.className = "status-banner show ok";
    status.textContent = data.cached ? "AI reused cached drama record (0s wait)." : "AI successfully populated all drama fields.";
  } catch (err) {
    status.className = "status-banner show err";
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

function bindIngestFormEvents() {
  const f = $("singleIngestForm");
  if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $("saveDramaSubmitBtn");
    const status = $("saveDramaStatus");
    btn.disabled = true;
    status.className = "status-banner show info";
    status.textContent = "Saving drama record…";

    const payload = {
      title: $("f_title").value.trim(),
      urdu_title: $("f_urdu").value.trim(),
      series_name: $("f_series").value.trim() || null,
      episode_number: $("f_episode").value ? Number($("f_episode").value) : null,
      year: $("f_year").value.trim(),
      type: $("f_type").value,
      writer: $("f_writer").value.trim(),
      director: $("f_director").value.trim(),
      produced: $("f_produced").value.trim(),
      cast: $("f_cast").value.trim(),
      description: $("f_description").value.trim(),
      youtube_url: $("f_youtube").value.trim()
    };

    const { data, error } = await window.sbClient.from("Drama").insert(payload).select().single();
    if (error) {
      status.className = "status-banner show err";
      status.textContent = error.message;
      btn.disabled = false;
      return;
    }

    const dramaId = data.id;
    const customFile = $("f_customFile")?.files?.[0];

    if (customFile) {
      status.textContent = "Uploading custom photo…";
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
      status.textContent = "Storing YouTube thumbnail…";
      await fetch(`/api/store-thumbnail`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + authSession?.access_token
        },
        body: JSON.stringify({ dramaId, imageUrl: stagedThumbnailUrl })
      }).catch(() => {});
    }

    status.className = "status-banner show ok";
    status.textContent = "Drama successfully saved to archive!";
    setTimeout(async () => {
      await fetchArchiveData();
      switchStudioTab("series");
      renderStudioDashboard();
    }, 1200);
  };
}

async function runPlaylistPreview() {
  const url = $("plInputUrl").value.trim();
  const status = $("plStatusMsgTop");
  const btn = $("plPreviewBtn");
  if (!url) return;

  btn.disabled = true;
  status.className = "status-banner show info";
  status.textContent = "Fetching playlist items from YouTube…";

  try {
    const res = await fetch("/api/playlist-preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + authSession?.access_token
      },
      body: JSON.stringify({ url, limit: 50 })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Preview failed");

    plItems = (data.items || []).map((it, i) => ({
      ...it,
      ep: it.episode || String(i + 1),
      selected: true
    }));

    $("plEpisodesHeaderTitle").textContent = `${plItems.length} Episodes Detected in Playlist`;
    $("plSeriesName").value = data.suggestedSeries || cleanDramaTitle(data.playlist?.title);
    $("plItemsListBox").innerHTML = plItems.map((it, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
        <input type="checkbox" id="plCheck-${i}" ${it.selected ? 'checked' : ''} onchange="plItems[${i}].selected=this.checked">
        <span class="ep-num-badge">${it.ep}</span>
        <img src="${esc(it.thumbnail)}" style="width:60px;aspect-ratio:16/9;object-fit:cover;border-radius:4px" onerror="this.onerror=null; this.src='/logo.png';">
        <span style="font-size:13px;font-weight:600;color:#fff">${esc(it.title)}</span>
      </div>
    `).join("");

    $("plWizardContent").style.display = "block";
    status.className = "status-banner show ok";
    status.textContent = `Preview loaded with ${plItems.length} videos. Review and click "Add to Archive".`;
  } catch (err) {
    status.className = "status-banner show err";
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

function toggleAllPlaylistChecks(checked) {
  plItems.forEach((it, i) => {
    it.selected = checked;
    const cb = $(`plCheck-${i}`);
    if (cb) cb.checked = checked;
  });
}

async function runPlaylistBatchImport() {
  const url = $("plInputUrl").value.trim();
  const seriesName = $("plSeriesName").value.trim();
  const status = $("plBatchStatus");
  const btn = $("plStartImportBtn");
  const selectedIds = plItems.filter(x => x.selected).map(x => x.id);

  if (!selectedIds.length) {
    alert("Please select at least one episode to import.");
    return;
  }

  btn.disabled = true;
  status.className = "status-banner show info";
  status.textContent = `Importing ${selectedIds.length} episodes…`;

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
        category: $("plCategory").value,
        videoIds: selectedIds
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Batch import failed");

    status.className = "status-banner show ok";
    status.textContent = `Successfully added ${data.added} episodes to "${data.series}"! (${data.skipped} already in archive). Reloading…`;
    setTimeout(async () => {
      await fetchArchiveData();
      switchStudioTab("series");
      renderStudioDashboard();
    }, 1500);
  } catch (err) {
    status.className = "status-banner show err";
    status.textContent = err.message;
    btn.disabled = false;
  }
}
