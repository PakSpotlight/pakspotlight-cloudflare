package com.classictvpakistan.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
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
    private final ExecutorService io = Executors.newFixedThreadPool(4);
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout content;
    private TextView status;
    private final java.util.Map<String, Bitmap> imageCache = new java.util.concurrent.ConcurrentHashMap<>();

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

        status = text("Connecting to Supabase catalogue…", 13, Color.LTGRAY, false);
        root.addView(status, new LinearLayout.LayoutParams(-1, dp(34)));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(8), 0, dp(36));
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private void loadCatalog() {
        io.execute(() -> {
            try {
                List<Drama> rows = fetchRows();
                List<String> categories = fetchCategories();
                main.post(() -> render(rows, categories));
            } catch (Exception e) {
                main.post(() -> status.setText("Catalogue connection failed: " + e.getMessage()));
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
            final int count = rows.size();
            main.post(() -> status.setText("Loading Supabase archive… " + count + " records"));
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
        status.setText("Connected · " + rows.size() + " Supabase records");
        content.removeAllViews();
        addSection("Latest Dramas", rows, 24, false);
        for (String category : categories) {
            List<Drama> matches = new ArrayList<>();
            for (Drama d : rows) if (same(d.type, category)) matches.add(d);
            if (!matches.isEmpty()) addSection(category, matches, 36, true);
        }
        if (content.getChildCount() == 1) addSection("All Dramas", rows, 36, false);
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
        image.setBackgroundColor(Color.rgb(24, 28, 26));
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        card.addView(image, new LinearLayout.LayoutParams(-1, dp(135)));
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
        String[] labels = new String[episodes.size()];
        for (int i = 0; i < episodes.size(); i++) {
            Drama d = episodes.get(i);
            labels[i] = (d.episode > 0 ? "Episode " + d.episode + " · " : "") + d.title;
        }
        new AlertDialog.Builder(this).setTitle(title).setItems(labels, (dialog, which) -> selected(episodes.get(which)))
            .setNegativeButton("Close", null).show();
    }

    private void selected(Drama d) {
        Toast.makeText(this, "Supabase item loaded: " + d.title + "\nPlayer integration is the next stage.", Toast.LENGTH_LONG).show();
    }

    private void loadImage(String address, ImageView target) {
        Bitmap cached = imageCache.get(address);
        if (cached != null) { target.setImageBitmap(cached); return; }
        io.execute(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(address).openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(15000);
                Bitmap bitmap = BitmapFactory.decodeStream(c.getInputStream());
                if (bitmap != null) {
                    imageCache.put(address, bitmap);
                    main.post(() -> target.setImageBitmap(bitmap));
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
