package com.classictvpakistan.tv;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.liskovsoft.smartyoutubetv2.common.exoplayer.selector.FormatItem;
import com.liskovsoft.smartyoutubetv2.common.prefs.PlayerData;
import com.liskovsoft.smartyoutubetv2.common.prefs.PlayerTweaksData;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class CatalogActivity extends Activity {
    private static final String API = "https://whcseoasnaswlhnzduix.supabase.co";
    private static final String KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
    private static final int BG = Color.rgb(5, 7, 6);
    private static final int GOLD = Color.rgb(216, 177, 90);
    private static final int TYPE_HEADER = 0;
    private static final int TYPE_EPISODE = 1;

    // Only catalogue data is fetched here. Glide owns thumbnail networking,
    // decoding, request cancellation, memory cache and disk cache.
    private final ExecutorService dataIo = Executors.newSingleThreadExecutor();
    private LinearLayout root;
    private RecyclerView list;
    private List<Drama> catalogRows;
    private List<String> catalogCategories;
    private SectionAdapter catalogAdapter;
    private TextView status;
    private LinearLayout sidebar;
    private ScrollView sidebarScroll;
    private FrameLayout heroPanel;
    private ImageView heroImage;
    private TextView heroTitle;
    private TextView heroUrdu;
    private TextView heroPlay;
    private String selectedNav = "Home";
    private Typeface urduTypeface;
    private boolean showingSeriesPage;
    private int catalogScrollY;

    private static final class Drama {
        int id;
        String title, urdu, type, series, year, image, youtube;
        int episode;
        JSONObject raw;
    }

    private static final class Section {
        final String title;
        final List<Drama> items;
        final boolean seriesGroups;
        Section(String title, List<Drama> items, boolean seriesGroups) {
            this.title = title;
            this.items = items;
            this.seriesGroups = seriesGroups;
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        try { urduTypeface = Typeface.createFromAsset(getAssets(), "fonts/NotoNastaliqUrdu-Regular.ttf"); }
        catch (Exception ignored) { urduTypeface = Typeface.DEFAULT; }
        PlayerData.instance(this).setFormat(FormatItem.VIDEO_AUTO);
        PlayerTweaksData.instance(this).setAvcOverVp9Preferred(true);
        // Keep YouTube's player suggestions enabled; the catalogue overlay must not hide them.
        PlayerTweaksData.instance(this).setSuggestionsDisabled(false);
        buildShell();
        loadCatalog();
    }

    private void buildShell() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(24), dp(16), dp(18), dp(10));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.addView(text("CLASSIC TV PAKISTAN", 25, Color.WHITE, true),
                new LinearLayout.LayoutParams(-1, dp(34)));
        status = text("PAKISTANI DRAMA ARCHIVE", 11, GOLD, true);
        status.setLetterSpacing(0.16f);
        header.addView(status, new LinearLayout.LayoutParams(-1, dp(25)));
        root.addView(header, new LinearLayout.LayoutParams(-1, dp(62)));

        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.HORIZONTAL);
        body.setGravity(Gravity.TOP);
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1));

        sidebarScroll = new ScrollView(this);
        sidebarScroll.setFillViewport(false);
        sidebarScroll.setVerticalScrollBarEnabled(false);
        sidebar = new LinearLayout(this);
        sidebar.setOrientation(LinearLayout.VERTICAL);
        sidebar.setPadding(0, dp(8), dp(16), dp(8));
        sidebarScroll.addView(sidebar, new ScrollView.LayoutParams(-1, -2));
        body.addView(sidebarScroll, new LinearLayout.LayoutParams(dp(176), -1));
        renderSidebar();

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        body.addView(content, new LinearLayout.LayoutParams(0, -1, 1f));

        heroPanel = new FrameLayout(this);
        heroPanel.setFocusable(false);
        heroPanel.setBackground(border(false));
        heroPanel.setClipToOutline(true);
        heroImage = new ImageView(this);
        heroImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
        heroPanel.addView(heroImage, new FrameLayout.LayoutParams(-1, -1));

        View scrim = new View(this);
        scrim.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{Color.rgb(5, 7, 6), 0xCC050706, 0x22050706}));
        heroPanel.addView(scrim, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout heroCopy = new LinearLayout(this);
        heroCopy.setOrientation(LinearLayout.VERTICAL);
        heroCopy.setGravity(Gravity.CENTER_VERTICAL);
        heroCopy.setPadding(dp(24), dp(12), dp(18), dp(12));
        FrameLayout.LayoutParams copyParams = new FrameLayout.LayoutParams(
                dp(510), -1, Gravity.LEFT | Gravity.CENTER_VERTICAL);
        heroPanel.addView(heroCopy, copyParams);

        TextView eyebrow = text("FEATURED FROM THE ARCHIVE", 10, GOLD, true);
        eyebrow.setLetterSpacing(0.14f);
        heroCopy.addView(eyebrow, new LinearLayout.LayoutParams(-1, dp(22)));
        heroUrdu = text("", 17, GOLD, false);
        heroUrdu.setTypeface(urduTypeface);
        heroUrdu.setTextDirection(View.TEXT_DIRECTION_RTL);
        heroUrdu.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        heroCopy.addView(heroUrdu, new LinearLayout.LayoutParams(-1, dp(34)));
        heroTitle = text("Classic Pakistani Dramas", 24, Color.WHITE, true);
        heroTitle.setMaxLines(2);
        heroCopy.addView(heroTitle, new LinearLayout.LayoutParams(-1, dp(58)));
        heroPlay = text("▶   PLAY NOW", 13, Color.BLACK, true);
        heroPlay.setGravity(Gravity.CENTER);
        heroPlay.setBackground(border(true));
        heroPlay.setBackgroundTintList(android.content.res.ColorStateList.valueOf(GOLD));
        heroPlay.setFocusable(true);
        heroPlay.setClickable(true);
        heroPlay.setOnClickListener(v -> {
            if (catalogRows != null && !catalogRows.isEmpty()) selected(catalogRows.get(0));
        });
        LinearLayout.LayoutParams playParams = new LinearLayout.LayoutParams(dp(150), dp(38));
        playParams.topMargin = dp(5);
        heroCopy.addView(heroPlay, playParams);
        LinearLayout.LayoutParams heroParams = new LinearLayout.LayoutParams(-1, dp(196));
        heroParams.bottomMargin = dp(8);
        content.addView(heroPanel, heroParams);

        list = new RecyclerView(this);
        list.setBackgroundColor(BG);
        list.setClipToPadding(false);
        list.setPadding(0, dp(2), 0, dp(30));
        list.setItemAnimator(null);
        list.setHasFixedSize(false);
        list.setLayoutManager(new LinearLayoutManager(this, RecyclerView.VERTICAL, false));
        list.setItemViewCacheSize(3);
        content.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    // Menu labels come from the same type values used by the website catalogue.
    // Only Home and Latest Dramas are fixed navigation destinations.
    private void renderSidebar() {
        if (sidebar == null) return;
        sidebar.removeAllViews();
        addNavItem("Home");
        addNavItem("Latest Dramas");
        if (catalogCategories != null) {
            for (String category : catalogCategories) {
                if (category == null || category.trim().isEmpty()
                        || "Home".equals(category) || "Latest Dramas".equals(category)) continue;
                addNavItem(category);
            }
        }
        updateNavStyles();
    }

    private void addNavItem(String label) {
        TextView item = text(label, 15, selectedNav.equals(label) ? GOLD : Color.LTGRAY, true);
        item.setGravity(Gravity.CENTER_VERTICAL);
        item.setPadding(dp(14), 0, dp(8), 0);
        item.setFocusable(true);
        item.setClickable(true);
        item.setBackground(border(selectedNav.equals(label)));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(48));
        params.bottomMargin = dp(7);
        sidebar.addView(item, params);
        item.setOnClickListener(v -> {
            selectedNav = label;
            renderCatalog();
        });
        item.setOnFocusChangeListener((v, focused) -> {
            if (focused) item.setBackground(border(true));
            else updateNavStyles();
        });
        item.setTag(label);
    }

    private void updateNavStyles() {
        if (sidebar == null) return;
        for (int i = 0; i < sidebar.getChildCount(); i++) {
            View child = sidebar.getChildAt(i);
            if (!(child instanceof TextView)) continue;
            boolean active = selectedNav.equals(String.valueOf(child.getTag()));
            child.setBackground(border(active));
            ((TextView) child).setTextColor(active ? GOLD : Color.LTGRAY);
        }
    }

    private void updateHero() {
        if (catalogRows == null || catalogRows.isEmpty() || heroImage == null) return;
        Drama featured = catalogRows.get(0);
        heroTitle.setText(featured.title);
        heroUrdu.setText(featured.urdu);
        heroUrdu.setVisibility(featured.urdu.isEmpty() ? View.GONE : View.VISIBLE);
        String image = preferredThumbnail(featured);
        Glide.with(this).load(image).centerCrop().dontAnimate()
                .diskCacheStrategy(DiskCacheStrategy.ALL).into(heroImage);
        heroPlay.setOnClickListener(v -> selected(featured));
    }

    private void loadCatalog() {
        dataIo.execute(() -> {
            try {
                // Render a small first page immediately. Remaining records are
                // fetched in the background so a slow connection or large table
                // does not block the first screen.
                List<Drama> firstPage = fetchRowsPage(0, 200);
                if (firstPage.isEmpty()) throw new Exception("Supabase returned no drama records");
                List<String> categories = collectCategories(firstPage);
                runOnUiThread(() -> {
                    catalogRows = new ArrayList<>(firstPage);
                    catalogCategories = categories;
                    renderSidebar();
                    renderCatalog();
                    status.setText("LOADING MORE DRAMAS...");
                });

                int offset = firstPage.size();
                while (offset < 50000) {
                    List<Drama> page;
                    try {
                        page = fetchRowsPage(offset, 1000);
                    } catch (Exception pageError) {
                        runOnUiThread(() -> status.setText("SHOWING LOADED DRAMAS • CONNECTION PAUSED"));
                        break;
                    }
                    if (page.isEmpty()) break;
                    runOnUiThread(() -> appendCatalogPage(page));
                    offset += page.size();
                    if (page.size() < 1000) break;
                }
                runOnUiThread(() -> status.setText("PAKISTANI DRAMA ARCHIVE"));
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this,
                        "Catalogue connection failed: " + e.getMessage(),
                        Toast.LENGTH_LONG).show());
            }
        });
    }

    private List<Drama> fetchRowsPage(int offset, int limit) throws Exception {
        List<Drama> rows = new ArrayList<>();
        String query = "/rest/v1/Drama?select=id,title,urdu_title,description,youtube_url,thumbnail_url,type,series_name,episode_number,year&order=id.desc&limit="
                + limit + "&offset=" + offset;
        JSONArray page = requestArray(API + query);
        for (int i = 0; i < page.length(); i++) {
            JSONObject o = page.getJSONObject(i);
            Drama d = new Drama();
            d.raw = o;
            d.id = o.optInt("id");
            d.title = clean(o.optString("title", ""), "Untitled");
            d.urdu = clean(o.optString("urdu_title", ""), "");
            d.type = clean(o.optString("type", ""), "Other");
            d.series = clean(o.optString("series_name", ""), "");
            d.year = clean(o.optString("year", ""), "");
            d.image = clean(o.optString("thumbnail_url", ""), "");
            d.youtube = clean(o.optString("youtube_url", ""), "");
            d.episode = o.optInt("episode_number", 0);
            rows.add(d);
        }
        return rows;
    }

    // Build category rails from the actual values stored in Supabase. Do not
    // assume a fixed list: new/less common types may occur after the first page.
    private List<String> collectCategories(List<Drama> rows) {
        LinkedHashMap<String, Boolean> found = new LinkedHashMap<>();
        for (Drama d : rows) {
            String type = d.type == null ? "" : d.type.trim();
            if (!type.isEmpty()) found.put(type, Boolean.TRUE);
        }
        return new ArrayList<>(found.keySet());
    }

    private void appendCatalogPage(List<Drama> page) {
        if (catalogRows == null || catalogAdapter == null) return;
        catalogRows.addAll(page);
        List<String> previousCategories = catalogCategories == null
                ? new ArrayList<>() : new ArrayList<>(catalogCategories);
        catalogCategories = collectCategories(catalogRows);
        if (!previousCategories.containsAll(catalogCategories)
                || !catalogCategories.containsAll(previousCategories)) renderSidebar();
        if ("Home".equals(selectedNav) || "Latest Dramas".equals(selectedNav)) {
            catalogAdapter.appendPage(page);
        } else {
            List<Drama> selectedCategoryRows = new ArrayList<>();
            for (Drama drama : page) {
                if (same(drama.type, selectedNav)) selectedCategoryRows.add(drama);
            }
            if (!selectedCategoryRows.isEmpty()) catalogAdapter.appendPage(selectedCategoryRows);
        }
    }

    private JSONArray requestArray(String address) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setRequestMethod("GET");
        c.setConnectTimeout(8000);
        c.setReadTimeout(12000);
        c.setRequestProperty("apikey", KEY);
        c.setRequestProperty("Authorization", "Bearer " + KEY);
        c.setRequestProperty("Accept", "application/json");
        try {
            int code = c.getResponseCode();
            InputStream in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            in.close();
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
            return new JSONArray(out.toString("UTF-8"));
        } finally {
            c.disconnect();
        }
    }

    private void renderCatalog() {
        showingSeriesPage = false;
        catalogScrollY = 0;
        if (heroPanel != null) heroPanel.setVisibility(
                "Home".equals(selectedNav) || "Latest Dramas".equals(selectedNav) ? View.VISIBLE : View.GONE);
        updateHero();
        updateNavStyles();
        List<Section> sections = new ArrayList<>();
        catalogCategories = collectCategories(catalogRows);
        if ("Home".equals(selectedNav)) {
            sections.add(new Section("Latest Dramas", catalogRows, false));
            for (String category : catalogCategories) {
                List<Drama> matches = rowsForCategory(category);
                if (!matches.isEmpty()) sections.add(new Section(category, matches, true));
            }
        } else if ("Latest Dramas".equals(selectedNav)) {
            sections.add(new Section("Latest Dramas", catalogRows, false));
        } else {
            List<Drama> matches = rowsForCategory(selectedNav);
            if (!matches.isEmpty()) sections.add(new Section(selectedNav, matches, true));
        }
        if (sections.isEmpty()) sections.add(new Section(selectedNav, new ArrayList<>(), false));
        catalogAdapter = new SectionAdapter(sections);
        list.setLayoutManager(new LinearLayoutManager(this, RecyclerView.VERTICAL, false));
        list.setAdapter(catalogAdapter);
        list.scrollToPosition(0);
    }

    private List<Drama> rowsForCategory(String category) {
        List<Drama> matches = new ArrayList<>();
        for (Drama d : catalogRows) if (same(d.type, category)) matches.add(d);
        return matches;
    }

    private void showSeriesPage(String title, List<Drama> episodes) {
        showingSeriesPage = true;
        if (heroPanel != null) heroPanel.setVisibility(View.GONE);
        catalogScrollY = list.computeVerticalScrollOffset();
        List<Drama> ordered = new ArrayList<>(episodes);
        ordered.sort((a, b) -> {
            if (a.episode > 0 && b.episode > 0) return Integer.compare(a.episode, b.episode);
            return Integer.compare(a.id, b.id);
        });
        EpisodeAdapter episodeAdapter = new EpisodeAdapter(title, ordered);
        int columns = Math.max(3, Math.min(5,
                getResources().getDisplayMetrics().widthPixels / dp(220)));
        GridLayoutManager grid = new GridLayoutManager(this, columns);
        grid.setSpanSizeLookup(new GridLayoutManager.SpanSizeLookup() {
            @Override public int getSpanSize(int position) {
                return position == 0 ? columns : 1;
            }
        });
        list.setLayoutManager(grid);
        list.setAdapter(episodeAdapter);
        list.scrollToPosition(0);
    }

    private void restoreCatalog() {
        if (catalogRows == null || catalogCategories == null) return;
        renderCatalog();
        list.post(() -> list.scrollBy(0, catalogScrollY));
        showingSeriesPage = false;
    }

    @Override public void onBackPressed() {
        if (showingSeriesPage) {
            restoreCatalog();
            return;
        }
        super.onBackPressed();
    }

    private void openGroup(String title, List<Drama> episodes) {
        if (episodes.size() == 1) selected(episodes.get(0));
        else showSeriesPage(title, episodes);
    }

    private void selected(Drama d) {
        if (d.youtube == null || d.youtube.trim().isEmpty()) {
            Toast.makeText(this, "No YouTube video link is saved for " + d.title,
                    Toast.LENGTH_LONG).show();
            return;
        }
        try {
            Intent play = new Intent(Intent.ACTION_VIEW, Uri.parse(d.youtube.trim()));
            play.setComponent(new ComponentName(this,
                    "com.liskovsoft.smartyoutubetv2.tv.ui.main.SplashActivity"));
            startActivity(play);
        } catch (Exception e) {
            Toast.makeText(this, "Could not open video: " + e.getMessage(),
                    Toast.LENGTH_LONG).show();
        }
    }

    private final class SectionAdapter extends RecyclerView.Adapter<SectionHolder> {
        private final List<Section> sections;
        SectionAdapter(List<Section> sections) { this.sections = sections; }
        @Override public SectionHolder onCreateViewHolder(ViewGroup parent, int type) {
            LinearLayout block = new LinearLayout(CatalogActivity.this);
            block.setOrientation(LinearLayout.VERTICAL);
            TextView heading = text("", 21, Color.WHITE, true);
            heading.setIncludeFontPadding(true);
            heading.setPadding(0, dp(7), 0, dp(5));
            block.addView(heading, new LinearLayout.LayoutParams(-1, dp(44)));
            RecyclerView rail = new RecyclerView(CatalogActivity.this);
            rail.setLayoutManager(new LinearLayoutManager(CatalogActivity.this,
                    RecyclerView.HORIZONTAL, false));
            rail.setItemAnimator(null);
            rail.setHasFixedSize(true);
            rail.setNestedScrollingEnabled(false);
            rail.setClipToPadding(false);
            rail.setItemViewCacheSize(4);
            block.addView(rail, new LinearLayout.LayoutParams(-1, dp(166)));
            return new SectionHolder(block, heading, rail);
        }
        @Override public void onBindViewHolder(SectionHolder holder, int position) {
            Section section = sections.get(position);
            holder.heading.setText(section.title);
            holder.rail.setAdapter(new DramaCardAdapter(section.items, section.seriesGroups));
            holder.itemView.setTag(holder.rail);
        }
        void appendPage(List<Drama> page) {
            // Add newly encountered Supabase types as new rails, then append
            // records to existing rails. This also handles categories that do
            // not appear in the first 200 rows.
            for (Drama d : page) {
                String type = d.type == null ? "" : d.type.trim();
                if (type.isEmpty()) continue;
                if (!"Home".equals(selectedNav) && !"Latest Dramas".equals(selectedNav)
                        && !same(type, selectedNav)) continue;
                Section target = null;
                for (Section section : sections) {
                    if (!"Latest Dramas".equals(section.title) && same(section.title, type)) {
                        target = section;
                        break;
                    }
                }
                if (target == null) {
                    target = new Section(type, new ArrayList<>(), true);
                    sections.add(target);
                    notifyItemInserted(sections.size() - 1);
                    if (catalogCategories != null && !catalogCategories.contains(type)) {
                        catalogCategories.add(type);
                    }
                }
                target.items.add(d);
            }
            // Latest Dramas shares catalogRows, while category rails use their
            // own lists. Refresh attached rails so appended rows become visible.
            for (int i = 0; i < list.getChildCount(); i++) {
                View child = list.getChildAt(i);
                Object tag = child.getTag();
                if (tag instanceof RecyclerView) {
                    RecyclerView rail = (RecyclerView) tag;
                    RecyclerView.Adapter<?> adapter = rail.getAdapter();
                    if (adapter instanceof DramaCardAdapter) {
                        ((DramaCardAdapter) adapter).refreshData();
                    }
                }
            }
        }
        @Override public int getItemCount() { return sections.size(); }
    }

    private static final class SectionHolder extends RecyclerView.ViewHolder {
        final TextView heading;
        final RecyclerView rail;
        SectionHolder(View item, TextView heading, RecyclerView rail) {
            super(item);
            this.heading = heading;
            this.rail = rail;
        }
    }

    private final class DramaCardAdapter extends RecyclerView.Adapter<CardHolder> {
        private final List<Drama> rows;
        private List<List<Drama>> groupedRows;
        private final boolean groupSeries;
        DramaCardAdapter(List<Drama> rows, boolean groupSeries) {
            this.rows = rows;
            this.groupSeries = groupSeries;
            rebuildGroups();
        }
        private void rebuildGroups() {
            this.groupedRows = groupSeries ? buildGroups(rows) : null;
        }
        void refreshData() {
            rebuildGroups();
            notifyDataSetChanged();
        }
        @Override public CardHolder onCreateViewHolder(ViewGroup parent, int type) {
            LinearLayout card = new LinearLayout(CatalogActivity.this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setFocusable(true);
            card.setClickable(true);
            card.setPadding(dp(5), dp(5), dp(5), dp(6));
            card.setBackground(border(false));
            ImageView image = new ImageView(CatalogActivity.this);
            image.setBackgroundColor(Color.BLACK);
            image.setScaleType(ImageView.ScaleType.CENTER_CROP);
            card.addView(image, new LinearLayout.LayoutParams(-1, dp(101)));
            LinearLayout titleRow = new LinearLayout(CatalogActivity.this);
            titleRow.setOrientation(LinearLayout.HORIZONTAL);
            titleRow.setGravity(Gravity.CENTER_VERTICAL);
            titleRow.setPadding(dp(2), dp(3), dp(2), 0);
            TextView name = text("", 14, Color.WHITE, true);
            name.setSingleLine(true);
            name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            titleRow.addView(name, new LinearLayout.LayoutParams(0, dp(36), 1f));
            TextView urdu = text("", 13, GOLD, false);
            urdu.setTypeface(urduTypeface);
            urdu.setTextDirection(View.TEXT_DIRECTION_RTL);
            urdu.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
            urdu.setSingleLine(true);
            urdu.setEllipsize(android.text.TextUtils.TruncateAt.END);
            titleRow.addView(urdu, new LinearLayout.LayoutParams(dp(82), dp(42)));
            card.addView(titleRow);
            TextView meta = text("", 10, GOLD, true);
            meta.setMaxLines(1);
            card.addView(meta);
            card.setOnFocusChangeListener((v, focused) -> v.setBackground(border(focused)));
            card.setLayoutParams(new RecyclerView.LayoutParams(dp(190), dp(156)));
            return new CardHolder(card, image, name, urdu, meta);
        }
        @Override public void onBindViewHolder(CardHolder holder, int position) {
            List<Drama> group = groupAt(position);
            Drama d = group.get(0);
            String label = !d.series.trim().isEmpty() ? d.series : d.title;
            holder.title.setText(label);
            holder.urdu.setText(d.urdu);
            holder.urdu.setVisibility(d.urdu.isEmpty() ? View.GONE : View.VISIBLE);
            holder.meta.setText(group.size() > 1 ? group.size() + " EPISODES" :
                    (isMovieCategory(d.type) ? d.year : (d.year.isEmpty() ? "" : d.year)));
            holder.itemView.setOnClickListener(v -> openGroup(label, group));
            holder.imageUrl = preferredThumbnail(d);
            holder.imageWidth = dp(380);
            holder.imageHeight = dp(214);
            clearThumbnail(holder.image);
        }
        @Override public void onViewAttachedToWindow(CardHolder holder) {
            super.onViewAttachedToWindow(holder);
            loadThumbnail(holder.image, holder.imageUrl, holder.imageWidth, holder.imageHeight);
        }
        @Override public void onViewDetachedFromWindow(CardHolder holder) {
            clearThumbnail(holder.image);
            super.onViewDetachedFromWindow(holder);
        }
        @Override public void onViewRecycled(CardHolder holder) {
            holder.imageUrl = null;
            clearThumbnail(holder.image);
            super.onViewRecycled(holder);
        }
        private List<Drama> groupAt(int index) {
            if (!groupSeries) return single(rows.get(index));
            return groupedRows.get(index);
        }
        private List<Drama> single(Drama d) {
            List<Drama> one = new ArrayList<>();
            one.add(d);
            return one;
        }
        @Override public int getItemCount() {
            if (!groupSeries) return rows.size();
            return groupedRows.size();
        }
        private List<List<Drama>> buildGroups(List<Drama> source) {
            LinkedHashMap<String, List<Drama>> groups = new LinkedHashMap<>();
            for (Drama d : source) {
                boolean canGroupAsSeries = !isMovieCategory(d.type)
                        && !d.series.trim().isEmpty() && d.episode > 0;
                String key = canGroupAsSeries ? "series:" + d.series.trim() : "drama:" + d.id;
                if (!groups.containsKey(key)) groups.put(key, new ArrayList<>());
                groups.get(key).add(d);
            }
            return new ArrayList<>(groups.values());
        }
    }

    private static final class CardHolder extends RecyclerView.ViewHolder {
        final ImageView image;
        final TextView title, urdu, meta;
        String imageUrl;
        int imageWidth, imageHeight;
        CardHolder(View item, ImageView image, TextView title, TextView urdu, TextView meta) {
            super(item);
            this.image = image;
            this.title = title;
            this.urdu = urdu;
            this.meta = meta;
        }
    }

    private final class EpisodeAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {
        private final String seriesTitle;
        private final List<Drama> episodes;
        EpisodeAdapter(String title, List<Drama> episodes) {
            this.seriesTitle = title;
            this.episodes = episodes;
        }
        @Override public int getItemViewType(int position) {
            return position == 0 ? TYPE_HEADER : TYPE_EPISODE;
        }
        @Override public RecyclerView.ViewHolder onCreateViewHolder(ViewGroup parent, int type) {
            if (type == TYPE_HEADER) {
                LinearLayout header = new LinearLayout(CatalogActivity.this);
                header.setOrientation(LinearLayout.VERTICAL);
                TextView back = text("‹  BACK TO CATALOGUE", 16, GOLD, true);
                back.setFocusable(true);
                back.setClickable(true);
                back.setPadding(0, dp(12), 0, dp(16));
                back.setOnClickListener(v -> restoreCatalog());
                header.addView(back);
                TextView title = text(seriesTitle, 24, Color.WHITE, true);
                header.addView(title);
                TextView count = text(episodes.size() + " EPISODES", 12, GOLD, true);
                count.setPadding(0, 0, 0, dp(12));
                header.addView(count);
                return new HeaderHolder(header);
            }
            LinearLayout card = new LinearLayout(CatalogActivity.this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setFocusable(true);
            card.setClickable(true);
            card.setPadding(dp(6), dp(6), dp(6), dp(7));
            card.setBackground(border(false));
            ImageView image = new ImageView(CatalogActivity.this);
            image.setBackgroundColor(Color.BLACK);
            image.setScaleType(ImageView.ScaleType.CENTER_CROP);
            card.addView(image, new LinearLayout.LayoutParams(-1, dp(112)));
            TextView number = text("", 15, Color.WHITE, true);
            number.setPadding(dp(3), dp(5), dp(3), 0);
            card.addView(number);
            TextView title = text("", 12, GOLD, false);
            title.setMaxLines(2);
            title.setPadding(dp(3), 0, dp(3), 0);
            card.addView(title);
            card.setOnFocusChangeListener((v, focused) -> v.setBackground(border(focused)));
            RecyclerView.LayoutParams params = new RecyclerView.LayoutParams(-1, dp(164));
            params.setMargins(dp(4), dp(4), dp(4), dp(4));
            card.setLayoutParams(params);
            return new EpisodeHolder(card, image, number, title);
        }
        @Override public void onBindViewHolder(RecyclerView.ViewHolder holder, int position) {
            if (holder instanceof EpisodeHolder) {
                int index = position - 1;
                Drama d = episodes.get(index);
                EpisodeHolder h = (EpisodeHolder) holder;
                h.number.setText("Episode " + (d.episode > 0 ? d.episode : index + 1));
                h.title.setText(d.title);
                h.itemView.setOnClickListener(v -> selected(d));
                h.imageUrl = preferredThumbnail(d);
                h.imageWidth = dp(320);
                h.imageHeight = dp(180);
                clearThumbnail(h.image);
            }
        }
        @Override public void onViewAttachedToWindow(RecyclerView.ViewHolder holder) {
            super.onViewAttachedToWindow(holder);
            if (holder instanceof EpisodeHolder) {
                EpisodeHolder h = (EpisodeHolder) holder;
                loadThumbnail(h.image, h.imageUrl, h.imageWidth, h.imageHeight);
            }
        }
        @Override public void onViewDetachedFromWindow(RecyclerView.ViewHolder holder) {
            if (holder instanceof EpisodeHolder) clearThumbnail(((EpisodeHolder) holder).image);
            super.onViewDetachedFromWindow(holder);
        }
        @Override public void onViewRecycled(RecyclerView.ViewHolder holder) {
            if (holder instanceof EpisodeHolder) {
                EpisodeHolder h = (EpisodeHolder) holder;
                h.imageUrl = null;
                clearThumbnail(h.image);
            }
            super.onViewRecycled(holder);
        }
        @Override public int getItemCount() { return episodes.size() + 1; }
    }

    private static final class HeaderHolder extends RecyclerView.ViewHolder {
        HeaderHolder(View item) { super(item); }
    }
    private static final class EpisodeHolder extends RecyclerView.ViewHolder {
        final ImageView image;
        final TextView number, title;
        String imageUrl;
        int imageWidth, imageHeight;
        EpisodeHolder(View item, ImageView image, TextView number, TextView title) {
            super(item);
            this.image = image;
            this.number = number;
            this.title = title;
        }
    }

    // Prefer the video's own landscape YouTube thumbnail. Some catalogue
    // thumbnail_url values are portrait posters; those are only a fallback.
    private String preferredThumbnail(Drama drama) {
        String videoId = extractYoutubeId(drama.youtube);
        if (!videoId.isEmpty()) return "https://i.ytimg.com/vi/" + videoId + "/mqdefault.jpg";
        return drama.image;
    }

    private String extractYoutubeId(String raw) {
        if (raw == null || raw.trim().isEmpty()) return "";
        try {
            Uri uri = Uri.parse(raw.trim());
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            String id = "";
            if (host.endsWith("youtu.be")) {
                List<String> parts = uri.getPathSegments();
                if (!parts.isEmpty()) id = parts.get(0);
            } else if (host.contains("youtube.com") || host.contains("youtube-nocookie.com")) {
                id = uri.getQueryParameter("v");
                if (id == null || id.isEmpty()) {
                    List<String> parts = uri.getPathSegments();
                    for (int i = 0; i + 1 < parts.size(); i++) {
                        if ("embed".equals(parts.get(i)) || "shorts".equals(parts.get(i))
                                || "live".equals(parts.get(i))) {
                            id = parts.get(i + 1);
                            break;
                        }
                    }
                }
            }
            return id != null && id.matches("[A-Za-z0-9_-]{11}") ? id : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private void loadThumbnail(ImageView image, String url, int width, int height) {
        if (url == null || !url.startsWith("http")) return;
        Glide.with(image).load(url)
                .override(width, height)
                .centerCrop()
                .dontAnimate()
                .diskCacheStrategy(Build.VERSION.SDK_INT > 21 ? DiskCacheStrategy.ALL : DiskCacheStrategy.NONE)
                .into(image);
    }

    private void clearThumbnail(ImageView image) {
        Glide.with(getApplicationContext()).clear(image);
        image.setImageDrawable(null);
    }

    private GradientDrawable border(boolean focused) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(Color.rgb(12, 16, 14));
        d.setCornerRadius(dp(9));
        d.setStroke(dp(focused ? 3 : 1), focused ? GOLD : Color.rgb(40, 48, 43));
        return d;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(size);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER_VERTICAL);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private String clean(String value, String fallback) {
        if (value == null) return fallback;
        String trimmed = value.trim();
        if (trimmed.isEmpty() || "null".equalsIgnoreCase(trimmed)
                || "undefined".equalsIgnoreCase(trimmed)) return fallback;
        return trimmed;
    }

    private boolean isMovieCategory(String type) {
        if (type == null) return false;
        String value = type.toLowerCase();
        return value.contains("movie") || value.contains("film");
    }

    private boolean same(String a, String b) {
        return a != null && b != null && a.trim().equalsIgnoreCase(b.trim());
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override protected void onDestroy() {
        dataIo.shutdownNow();
        super.onDestroy();
    }
}
