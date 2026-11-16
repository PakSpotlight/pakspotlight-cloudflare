package com.classictvpakistan.tv;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.liskovsoft.smartyoutubetv2.common.exoplayer.selector.FormatItem;
import com.liskovsoft.smartyoutubetv2.common.prefs.PlayerData;
import com.liskovsoft.smartyoutubetv2.common.prefs.PlayerTweaksData;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.BufferedInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class CatalogActivity extends Activity {
    private static final String API = "https://whcseoasnaswlhnzduix.supabase.co";
    private static final String KEY = "sb_publishable_fkK2ryuBKr0WK96m34Cczg_7ofQBaOk";
    private static final int BG = Color.rgb(5, 7, 6);
    private static final int GOLD = Color.rgb(216, 177, 90);
    private final ExecutorService io = Executors.newFixedThreadPool(2);
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout content;
    private ScrollView catalogScroll;
    private List<Drama> catalogRows;
    private List<String> catalogCategories;
    private boolean showingSeriesPage;
    private final LruCache<String, Bitmap> imageCache = new LruCache<String, Bitmap>(Math.max(1024, (int) (Runtime.getRuntime().maxMemory() / 8 / 1024))) {
        @Override protected int sizeOf(String key, Bitmap value) { return Math.max(1, value.getByteCount() / 1024); }
    };

    private static final class Drama {
        int id;
        String title, urdu, type, series, year, image, youtube;
        int episode;
        JSONObject raw;
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
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(28), dp(20), dp(20), dp(12));

        TextView brand = text("CLASSIC TV PAKISTAN", 25, Color.WHITE, true);
        root.addView(brand);
        TextView sub = text("PAKISTANI DRAMA ARCHIVE", 11, GOLD, true);
        sub.setLetterSpacing(0.16f);
        root.addView(sub, new LinearLayout.LayoutParams(-1, dp(28)));

        catalogScroll = new ScrollView(this);
        catalogScroll.setFillViewport(false);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(8), 0, dp(36));
        catalogScroll.addView(content);
        root.addView(catalogScroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private void loadCatalog() {
        io.execute(() -> {
            try {
                List<Drama> rows = fetchRows();
                List<String> categories = fetchCategories();
                main.post(() -> { catalogRows = rows; catalogCategories = categories; render(rows, categories); });
            } catch (Exception e) {
                main.post(() -> Toast.makeText(this, "Catalogue connection failed: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private List<Drama> fetchRows() throws Exception {
        List<Drama> rows = new ArrayList<>();
        for (int offset = 0; offset < 50000; offset += 1000) {
            String query = "/rest/v1/Drama?select=id,title,urdu_title,description,youtube_url,thumbnail_url,type,series_name,episode_number,year&order=id.desc&limit=1000&offset=" + offset;
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
            if (page.length() < 1000) break;
        }
        if (rows.isEmpty()) throw new Exception("Supabase returned no drama records");
        return rows;
    }

    private List<String> fetchCategories() {
        List<String> result = new ArrayList<>();
        try {
            JSONArray a = requestArray(API + "/storage/v1/object/public/thumbnails/config/categories.json");
            for (int i = 0; i < a.length(); i++) result.add(a.optString(i));
        } catch (Exception ignored) { }
        if (result.isEmpty()) {
            result.add("Serial / Series");
            result.add("Long Play");
            result.add("Comedy");
            result.add("Shorts");
        }
        return result;
    }

    private JSONArray requestArray(String address) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setRequestMethod("GET");
        c.setConnectTimeout(15000);
        c.setReadTimeout(25000);
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
        } finally { c.disconnect(); }
    }

    private void render(List<Drama> rows, List<String> categories) {
        content.removeAllViews();
        showingSeriesPage = false;
        addSection("Latest Dramas", rows, 12, false);
        int initialViews = content.getChildCount();
        for (String category : categories) {
            List<Drama> matches = new ArrayList<>();
            for (Drama d : rows) if (same(d.type, category)) matches.add(d);
            if (!matches.isEmpty()) addSection(category, matches, 12, true);
        }
        if (content.getChildCount() == initialViews) addSection("All Dramas", rows, 12, false);
    }

    private void addSection(String title, List<Drama> source, int limit, boolean groupSeries) {
        TextView heading = text(title, 21, Color.WHITE, true);
        heading.setPadding(0, dp(18), 0, dp(8));
        content.addView(heading);

        LinkedHashMap<String, List<Drama>> groups = new LinkedHashMap<>();
        for (Drama d : source) {
            String key = groupSeries && !d.series.trim().isEmpty() ? "series:" + d.series.trim() : "drama:" + d.id;
            if (!groups.containsKey(key)) groups.put(key, new ArrayList<>());
            groups.get(key).add(d);
        }

        HorizontalScrollView rail = new HorizontalScrollView(this);
        rail.setHorizontalScrollBarEnabled(false);
        LinearLayout tiles = new LinearLayout(this);
        tiles.setOrientation(LinearLayout.HORIZONTAL);
        int shown = 0;
        for (List<Drama> group : groups.values()) {
            if (shown++ >= limit) break;
            Drama d = group.get(0);
            String label = !d.series.trim().isEmpty() ? d.series : d.title;
            tiles.addView(card(label, d.urdu, d.image, group.size(), () -> openGroup(label, group)));
        }
        rail.addView(tiles);
        content.addView(rail, new LinearLayout.LayoutParams(-1, dp(218)));
    }

    private View card(String title, String urdu, String imageUrl, int count, Runnable click) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setFocusable(true);
        card.setClickable(true);
        card.setPadding(dp(5), dp(5), dp(5), dp(6));
        card.setBackground(border(false));
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(dp(190), dp(210));
        cp.setMargins(0, 0, dp(12), 0);
        card.setLayoutParams(cp);

        ImageView image = new ImageView(this);
        image.setBackgroundColor(Color.BLACK);
        // Keep the complete YouTube thumbnail visible in a landscape 16:9 frame.
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        card.addView(image, new LinearLayout.LayoutParams(-1, dp(101))); // 16:9 image area
        if (imageUrl != null && imageUrl.startsWith("http")) loadImage(imageUrl, image);

        TextView name = text(title, 14, Color.WHITE, true);
        name.setMaxLines(2);
        name.setPadding(dp(2), dp(6), dp(2), 0);
        card.addView(name);
        if (count > 1) {
            TextView eps = text(count + " EPISODES", 10, GOLD, true);
            eps.setPadding(dp(2), dp(2), 0, 0);
            card.addView(eps);
        } else if (urdu != null && !urdu.trim().isEmpty()) {
            TextView urduText = text(urdu, 11, GOLD, false);
            urduText.setMaxLines(1);
            card.addView(urduText);
        }
        card.setOnFocusChangeListener((v, focused) -> v.setBackground(border(focused)));
        card.setOnClickListener(v -> click.run());
        return card;
    }

    private void openGroup(String title, List<Drama> episodes) {
        if (episodes.size() == 1) {
            selected(episodes.get(0));
            return;
        }
        showSeriesPage(title, episodes);
    }

    private void showSeriesPage(String title, List<Drama> episodes) {
        showingSeriesPage = true;
        content.removeAllViews();
        TextView back = text("‹  BACK TO CATALOGUE", 16, GOLD, true);
        back.setFocusable(true);
        back.setClickable(true);
        back.setPadding(0, dp(12), 0, dp(18));
        back.setOnClickListener(v -> restoreCatalog());
        content.addView(back);
        TextView heading = text(title, 24, Color.WHITE, true);
        heading.setPadding(0, 0, 0, dp(5));
        content.addView(heading);
        TextView count = text(episodes.size() + " EPISODES", 12, GOLD, true);
        count.setPadding(0, 0, 0, dp(14));
        content.addView(count);
        List<Drama> ordered = new ArrayList<>(episodes);
        ordered.sort((a, b) -> {
            if (a.episode > 0 && b.episode > 0) return Integer.compare(a.episode, b.episode);
            return Integer.compare(a.id, b.id);
        });
        for (int i = 0; i < ordered.size(); i++) content.addView(episodeRow(ordered.get(i), i + 1));
        catalogScroll.scrollTo(0, 0);
        back.requestFocus();
    }

    private View episodeRow(Drama drama, int position) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setFocusable(true);
        row.setClickable(true);
        row.setPadding(dp(8), dp(6), dp(8), dp(6));
        row.setBackground(border(false));
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, dp(108));
        rp.setMargins(0, 0, 0, dp(7));
        row.setLayoutParams(rp);
        ImageView image = new ImageView(this);
        image.setBackgroundColor(Color.BLACK);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        row.addView(image, new LinearLayout.LayoutParams(dp(160), dp(90)));
        if (drama.image != null && drama.image.startsWith("http")) loadImage(drama.image, image);
        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setPadding(dp(14), 0, 0, 0);
        labels.addView(text("Episode " + (drama.episode > 0 ? drama.episode : position), 16, Color.WHITE, true));
        TextView subtitle = text(drama.title, 13, GOLD, false);
        subtitle.setMaxLines(2);
        labels.addView(subtitle);
        row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
        row.setOnFocusChangeListener((v, focused) -> v.setBackground(border(focused)));
        row.setOnClickListener(v -> selected(drama));
        return row;
    }

    private void restoreCatalog() {
        if (catalogRows != null && catalogCategories != null) {
            render(catalogRows, catalogCategories);
            catalogScroll.scrollTo(0, 0);
            showingSeriesPage = false;
        }
    }

    @Override public void onBackPressed() {
        if (showingSeriesPage) {
            restoreCatalog();
            return;
        }
        super.onBackPressed();
    }

    private void selected(Drama d) {
        if (d.youtube == null || d.youtube.trim().isEmpty()) {
            Toast.makeText(this, "No YouTube video link is saved for " + d.title, Toast.LENGTH_LONG).show();
            return;
        }

        try {
            // Route through SmartTube's own SplashPresenter intent chain. This initializes
            // its playback/session services and opens PlaybackActivity directly, bypassing
            // SmartTube's browse/home UI while keeping the player inside this APK.
            Intent play = new Intent(Intent.ACTION_VIEW, Uri.parse(d.youtube.trim()));
            play.setComponent(new ComponentName(this,
                    "com.liskovsoft.smartyoutubetv2.tv.ui.main.SplashActivity"));
            startActivity(play);
        } catch (Exception e) {
            Toast.makeText(this, "Could not open video: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void loadImage(String address, ImageView target) {
        Bitmap cached = imageCache.get(address);
        target.setTag(address);
        if (cached != null) { target.setImageBitmap(cached); return; }
        io.execute(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(address).openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(15000);
                try (BufferedInputStream in = new BufferedInputStream(c.getInputStream())) {
                    in.mark(16 * 1024 * 1024);
                    BitmapFactory.Options bounds = new BitmapFactory.Options();
                    bounds.inJustDecodeBounds = true;
                    BitmapFactory.decodeStream(in, null, bounds);
                    in.reset();

                    // Decode near display size rather than retaining full-resolution images.
                    int reqWidth = Math.max(360, dp(360));
                    int reqHeight = Math.max(203, dp(203));
                    int sample = 1;
                    while (bounds.outWidth / (sample * 2) >= reqWidth &&
                           bounds.outHeight / (sample * 2) >= reqHeight) {
                        sample *= 2;
                    }
                    BitmapFactory.Options decode = new BitmapFactory.Options();
                    decode.inSampleSize = sample;
                    decode.inPreferredConfig = Bitmap.Config.RGB_565;
                    Bitmap bitmap = BitmapFactory.decodeStream(in, null, decode);
                    if (bitmap != null) {
                        imageCache.put(address, bitmap);
                        main.post(() -> { if (address.equals(target.getTag())) target.setImageBitmap(bitmap); });
                    }
                }
            } catch (Exception ignored) {
            } finally { if (c != null) c.disconnect(); }
        });
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

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }

    @Override protected void onDestroy() {
        io.shutdownNow();
        super.onDestroy();
    }
}
