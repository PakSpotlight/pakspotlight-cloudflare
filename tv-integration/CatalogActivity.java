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
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

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
        PlayerData.instance(this).setFormat(FormatItem.VIDEO_AUTO);
        PlayerTweaksData.instance(this).setAvcOverVp9Preferred(true);
        PlayerTweaksData.instance(this).setSuggestionsDisabled(true);
        buildShell();
        loadCatalog();
    }

    private void buildShell() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(28), dp(20), dp(20), dp(12));

        root.addView(text("CLASSIC TV PAKISTAN", 25, Color.WHITE, true),
                new LinearLayout.LayoutParams(-1, dp(34)));
        status = text("PAKISTANI DRAMA ARCHIVE", 11, GOLD, true);
        status.setLetterSpacing(0.16f);
        root.addView(status, new LinearLayout.LayoutParams(-1, dp(28)));

        list = new RecyclerView(this);
        list.setBackgroundColor(BG);
        list.setClipToPadding(false);
        list.setPadding(0, dp(6), 0, dp(30));
        list.setItemAnimator(null);
        list.setHasFixedSize(false);
        list.setLayoutManager(new LinearLayoutManager(this, RecyclerView.VERTICAL, false));
        list.setItemViewCacheSize(3);
        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private void loadCatalog() {
        dataIo.execute(() -> {
            try {
                // Render a small first page immediately. Remaining records are
                // fetched in the background so a slow connection or large table
                // does not block the first screen.
                List<Drama> firstPage = fetchRowsPage(0, 200);
                if (firstPage.isEmpty()) throw new Exception("Supabase returned no drama records");
                List<String> categories = defaultCategories();
                runOnUiThread(() -> {
                    catalogRows = new ArrayList<>(firstPage);
                    catalogCategories = categories;
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
            d.title = o.optString("title", "Untitled Drama");
            d.urdu = o.optString("urdu_title", "");
            d.type = o.optString("type", "Other");
            d.series = o.optString("series_name", "");
            d.year = o.optString("year", "");
            d.image = o.optString("thumbnail_url", "");
            d.youtube = o.optString("youtube_url", "");
            d.episode = o.optInt("episode_number", 0);
            rows.add(d);
        }
        return rows;
    }

    private List<String> defaultCategories() {
        List<String> result = new ArrayList<>();
        result.add("Serial / Series");
        result.add("Long Play");
        result.add("Comedy");
        result.add("Shorts");
        return result;
    }

    private void appendCatalogPage(List<Drama> page) {
        if (catalogRows == null || catalogAdapter == null) return;
        catalogRows.addAll(page);
        catalogAdapter.appendPage(page);
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
        List<Section> sections = new ArrayList<>();
        sections.add(new Section("Latest Dramas", catalogRows, false));
        for (String category : catalogCategories) {
            List<Drama> matches = new ArrayList<>();
            for (Drama d : catalogRows) if (same(d.type, category)) matches.add(d);
            if (!matches.isEmpty()) sections.add(new Section(category, matches, true));
        }
        if (sections.size() == 1) sections.add(new Section("All Dramas", catalogRows, false));
        catalogAdapter = new SectionAdapter(sections);
        list.setAdapter(catalogAdapter);
        list.scrollToPosition(0);
    }

    private void showSeriesPage(String title, List<Drama> episodes) {
        showingSeriesPage = true;
        catalogScrollY = list.computeVerticalScrollOffset();
        List<Drama> ordered = new ArrayList<>(episodes);
        ordered.sort((a, b) -> {
            if (a.episode > 0 && b.episode > 0) return Integer.compare(a.episode, b.episode);
            return Integer.compare(a.id, b.id);
        });
        list.setAdapter(new EpisodeAdapter(title, ordered));
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
            heading.setPadding(0, dp(17), 0, dp(8));
            block.addView(heading, new LinearLayout.LayoutParams(-1, dp(42)));
            RecyclerView rail = new RecyclerView(CatalogActivity.this);
            rail.setLayoutManager(new LinearLayoutManager(CatalogActivity.this,
                    RecyclerView.HORIZONTAL, false));
            rail.setItemAnimator(null);
            rail.setHasFixedSize(true);
            rail.setNestedScrollingEnabled(false);
            rail.setClipToPadding(false);
            rail.setItemViewCacheSize(4);
            block.addView(rail, new LinearLayout.LayoutParams(-1, dp(218)));
            return new SectionHolder(block, heading, rail);
        }
        @Override public void onBindViewHolder(SectionHolder holder, int position) {
            Section section = sections.get(position);
            holder.heading.setText(section.title);
            holder.rail.setAdapter(new DramaCardAdapter(section.items, section.seriesGroups));
            holder.itemView.setTag(holder.rail);
        }
        void appendPage(List<Drama> page) {
            for (Section section : sections) {
                if (!"Latest Dramas".equals(section.title)) {
                    for (Drama d : page) if (same(d.type, section.title)) section.items.add(d);
                }
            }
            // Refresh only the rails currently attached to the screen. Rails
            // created later will bind against the already-updated section data.
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
            image.setScaleType(ImageView.ScaleType.FIT_CENTER);
            card.addView(image, new LinearLayout.LayoutParams(-1, dp(101)));
            TextView name = text("", 14, Color.WHITE, true);
            name.setMaxLines(2);
            name.setPadding(dp(2), dp(6), dp(2), 0);
            card.addView(name);
            TextView meta = text("", 10, GOLD, true);
            meta.setMaxLines(1);
            card.addView(meta);
            card.setOnFocusChangeListener((v, focused) -> v.setBackground(border(focused)));
            card.setLayoutParams(new RecyclerView.LayoutParams(dp(190), dp(210)));
            return new CardHolder(card, image, name, meta);
        }
        @Override public void onBindViewHolder(CardHolder holder, int position) {
            List<Drama> group = groupAt(position);
            Drama d = group.get(0);
            String label = !d.series.trim().isEmpty() ? d.series : d.title;
            holder.title.setText(label);
            holder.meta.setText(group.size() > 1 ? group.size() + " EPISODES" : d.urdu);
            holder.itemView.setOnClickListener(v -> openGroup(label, group));
            holder.imageUrl = d.image;
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
                String key = !d.series.trim().isEmpty() ? "series:" + d.series.trim() : "drama:" + d.id;
                if (!groups.containsKey(key)) groups.put(key, new ArrayList<>());
                groups.get(key).add(d);
            }
            return new ArrayList<>(groups.values());
        }
    }

    private static final class CardHolder extends RecyclerView.ViewHolder {
        final ImageView image;
        final TextView title, meta;
        String imageUrl;
        int imageWidth, imageHeight;
        CardHolder(View item, ImageView image, TextView title, TextView meta) {
            super(item);
            this.image = image;
            this.title = title;
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
            LinearLayout row = new LinearLayout(CatalogActivity.this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setFocusable(true);
            row.setClickable(true);
            row.setPadding(dp(8), dp(6), dp(8), dp(6));
            row.setBackground(border(false));
            ImageView image = new ImageView(CatalogActivity.this);
            image.setBackgroundColor(Color.BLACK);
            image.setScaleType(ImageView.ScaleType.FIT_CENTER);
            row.addView(image, new LinearLayout.LayoutParams(dp(160), dp(90)));
            LinearLayout labels = new LinearLayout(CatalogActivity.this);
            labels.setOrientation(LinearLayout.VERTICAL);
            labels.setPadding(dp(14), 0, 0, 0);
            TextView number = text("", 16, Color.WHITE, true);
            labels.addView(number);
            TextView title = text("", 13, GOLD, false);
            title.setMaxLines(2);
            labels.addView(title);
            row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
            row.setOnFocusChangeListener((v, focused) -> v.setBackground(border(focused)));
            row.setLayoutParams(new RecyclerView.LayoutParams(-1, dp(108)));
            return new EpisodeHolder(row, image, number, title);
        }
        @Override public void onBindViewHolder(RecyclerView.ViewHolder holder, int position) {
            if (holder instanceof EpisodeHolder) {
                int index = position - 1;
                Drama d = episodes.get(index);
                EpisodeHolder h = (EpisodeHolder) holder;
                h.number.setText("Episode " + (d.episode > 0 ? d.episode : index + 1));
                h.title.setText(d.title);
                h.itemView.setOnClickListener(v -> selected(d));
                h.imageUrl = d.image;
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

    private void loadThumbnail(ImageView image, String url, int width, int height) {
        if (url == null || !url.startsWith("http")) return;
        Glide.with(image).load(url)
                .override(width, height)
                .centerInside()
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
