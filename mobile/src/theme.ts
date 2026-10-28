/**
 * Classic TV Pakistan — mobile-first cinematic design tokens.
 * Visual direction follows the supplied reference: deep midnight navy, warm gold,
 * photographic drama artwork, rounded poster cards and restrained premium chrome.
 */
export const color = {
  bg: "#06111D",
  surface: "#0D1A28",
  surfaceAlt: "#142333",
  line: "rgba(220,232,245,0.12)",
  lineStrong: "rgba(220,232,245,0.24)",
  text: "#F7F4EC",
  muted: "#A8B3C1",
  dim: "#718092",
  accent: "#F2C94C",
  accentSoft: "rgba(242,201,76,0.16)",
  ctaBg: "#F2C94C",
  ctaText: "#10151C",
  danger: "#FF6868",
  overlay: "rgba(2,8,15,0.68)",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { poster: 12, card: 16, pill: 999, thumb: 8 } as const;
export const gutter = 20;
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
export const type = { h1: 30, h2: 24, h3: 20, title: 17, body: 15, meta: 13, micro: 11 } as const;
export const heroScrim = ["rgba(2,8,15,0.08)", "rgba(2,8,15,0.70)", "#06111D"] as const;
export const POSTER_RATIO = 3 / 2;
export const GRID_COLUMNS = 3;
