/**
 * Classic TV Pakistan Vault — ARY Digital external-link catalogue.
 * This stores official links only; it never downloads or embeds ARY video.
 */
function renderAryPane() {
  return `
    <div class="sec">
      <div class="sec-head"><div><div class="sec-title">ARY Digital</div><div class="sec-sub">Add official ARY drama and episode links. Playback stays on ARY Plus.</div></div></div>
      <div class="add-box">
        <form id="aryEntryForm">
          <div class="divider-label">Drama / series</div>
          <div class="form-grid">
            <div class="field"><label for="aryTitle">Drama title</label><input id="aryTitle" required placeholder="Dar-E-Nijaat"></div>
            <div class="field"><label for="aryUrdu">Urdu title</label><input id="aryUrdu" class="urdu" placeholder="درِ نجات"></div>
            <div class="field full"><label for="arySeriesUrl">Official ARY series/share link</label><input id="arySeriesUrl" type="url" required placeholder="https://social.aryplus.tv/sharer/series/..."></div>
            <div class="field full"><label for="aryArtwork">Poster / thumbnail URL (optional)</label><input id="aryArtwork" type="url" placeholder="Official artwork URL"></div>
          </div>
          <div class="divider-label">Episode</div>
          <div class="form-grid">
            <div class="field"><label for="aryEpisodeNumber">Episode number</label><input id="aryEpisodeNumber" type="number" min="1" value="1" required></div>
            <div class="field"><label for="aryEpisodeTitle">Episode title (optional)</label><input id="aryEpisodeTitle" placeholder="Episode 1"></div>
            <div class="field full"><label for="aryVideoUrl">Official ARY Plus video link</label><input id="aryVideoUrl" type="url" required placeholder="https://aryplus.tv/video/v2/..."></div>
          </div>
          <div class="sheet-foot"><button class="btn btn-primary" type="submit" id="arySaveBtn">Save ARY episode</button></div>
          <div class="status" id="arySaveStatus"></div>
        </form>
      </div>
      <div class="sec-head" style="margin-top:24px"><div><div class="sec-title">Saved ARY links</div><div class="sec-sub">Entries saved in the separate ExternalMedia table.</div></div><button class="btn btn-quiet btn-sm" type="button" id="aryRefreshBtn">Refresh</button></div>
      <div id="aryEntriesList"><div class="status show info">Loading saved entries…</div></div>
    </div>`;
}
function isAllowedAryUrl(value, host) {
  try { var u = new URL(value); return u.protocol === "https:" && (u.hostname === host || u.hostname.endsWith("." + host)); }
  catch (e) { return false; }
}
function bindAryEvents() {
  var form = $("aryEntryForm");
  var refresh = $("aryRefreshBtn");
  if (form) form.onsubmit = saveAryEntry;
  if (refresh) refresh.onclick = loadAryEntries;
  if ($("pane-ary") && $("pane-ary").classList.contains("active")) loadAryEntries();
}
async function loadAryEntries() {
  var box = $("aryEntriesList");
  if (!box || !window.sbClient) return;
  box.innerHTML = '<div class="status show info">Loading saved entries…</div>';
  var result = await window.sbClient.from("ExternalMedia").select("*").eq("provider", "ary").order("created_at", { ascending: false }).limit(200);
  if (result.error) {
    box.innerHTML = '<div class="status show err">Could not load ARY entries. Apply the supplied ExternalMedia SQL setup first. ' + esc(result.error.message) + '</div>';
    return;
  }
  if (!result.data || !result.data.length) {
    box.innerHTML = '<div class="status show info">No ARY episodes saved yet.</div>';
    return;
  }
  box.innerHTML = '<div class="check-list">' + result.data.map(function(row) {
    return '<div class="detected"><div class="detected-meta"><div class="detected-title">' + esc(row.title) + ' — Episode ' + esc(row.episode_number) + '</div><div class="detected-sub">' + esc(row.episode_title || row.video_url) + '</div><a href="' + esc(row.video_url) + '" target="_blank" rel="noopener noreferrer">Open official episode</a></div></div>';
  }).join("") + '</div>';
}
async function saveAryEntry(event) {
  event.preventDefault();
  var status = $("arySaveStatus");
  var button = $("arySaveBtn");
  var seriesUrl = $("arySeriesUrl").value.trim();
  var videoUrl = $("aryVideoUrl").value.trim();
  if (!isAllowedAryUrl(seriesUrl, "aryplus.tv") || !isAllowedAryUrl(seriesUrl, "social.aryplus.tv") || !isAllowedAryUrl(videoUrl, "aryplus.tv")) {
    status.className = "status show err";
    status.textContent = "Use HTTPS links from social.aryplus.tv or aryplus.tv.";
    return;
  }
  button.disabled = true;
  status.className = "status show info";
  status.textContent = "Saving official ARY links…";
  var payload = {
    provider: "ary",
    title: $("aryTitle").value.trim(),
    urdu_title: $("aryUrdu").value.trim(),
    series_url: seriesUrl,
    episode_number: Number($("aryEpisodeNumber").value),
    episode_title: $("aryEpisodeTitle").value.trim(),
    video_url: videoUrl,
    thumbnail_url: $("aryArtwork").value.trim()
  };
  var result = await window.sbClient.from("ExternalMedia").insert(payload).select().single();
  button.disabled = false;
  if (result.error) {
    status.className = "status show err";
    status.textContent = result.error.message;
    return;
  }
  status.className = "status show ok";
  status.textContent = "ARY episode saved. You can now verify it in Saved ARY links.";
  $("aryEpisodeNumber").value = String(Number(payload.episode_number) + 1);
  $("aryEpisodeTitle").value = "";
  $("aryVideoUrl").value = "";
  await loadAryEntries();
}
