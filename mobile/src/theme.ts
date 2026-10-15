/**
 * Design tokens — Classic TV Pakistan mobile.
 * Language reference: docs/android-app-plan.md §7 (ARY Plus as the visual reference).
 *
 * Rules that keep the look coherent:
 *  - Black canvas. The accent appears on exactly five things: active tab underline, active nav
 *    item, progress bar, count badge, Roman-Urdu brush line. Nowhere else.
 *  - The primary action is a white pill with a black label. Never an accent-filled button.
 *  - Depth comes from scrims and hairlines, not shadows — Android 6 hardware can't afford them.
 */

export const color = {
  bg: "#000000",
  surface: "#0D0F0E",
  surfaceAlt: "#151917",
  line: "rgba(255,255,255,0.12)",
  lineStrong: "rgba(255,255,255,0.22)",
  text: "#FFFFFF",
  muted: "#9BA1A6",
  dim: "#5F6569",
  accent: "#C6F32A",
  accentSoft: "rgba(198,243,42,0.14)",
  ctaBg: "#FFFFFF",
  ctaText: "#08090A",
  danger: "#FF5A5F",
  overlay: "rgba(0,0,0,0.55)",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { poster: 12, card: 16, pill: 999, thumb: 8 } as const;

/** Screen gutter. Every screen uses this and nothing else. */
export const gutter = 20;

/**
 * Screens cap their width at this value. On a phone it never applies; on a tablet or in the
 * browser preview it keeps the phone layout honest instead of stretching posters across the screen.
 */
export const contentMaxWidth = 640;

export const font = {
  black: "Archivo_900Black",
  extra: "Archivo_800ExtraBold",
  bold: "Archivo_700Bold",
  medium: "Archivo_500Medium",
  body: "Archivo_400Regular",
  urdu: "NotoNastaliqUrdu_400Regular",
  brush: "PermanentMarker_400Regular",
} as const;

/** Type scale in dp. Titles are sentence case, never all caps. */
export const type = {
  h1: 30,
  h2: 24,
  h3: 20,
  title: 17,
  body: 15,
  meta: 13,
  micro: 11,
} as const;

/** Hero gradient stops, top → bottom. */
export const heroScrim = ["rgba(0,0,0,0.10)", "rgba(0,0,0,0.72)", "rgba(0,0,0,1)"] as const;

/** Archive posters are 2:3. Every card and poster slot in the app uses this ratio. */
export const POSTER_RATIO = 3 / 2;

/** How many poster columns the grids use at the app's supported widths. */
export const GRID_COLUMNS = 3;
