import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Deep-link landing for the website's share URLs, `classictvpakistan.com/watch?id=26`.
 * A shared link should open the drama's page — with the episode list and the description —
 * rather than dropping someone straight into playback.
 */
export default function WatchDeepLinkRoute() {
  const params = useLocalSearchParams<{ id?: string; v?: string }>();
  const target = params.id ?? params.v;
  if (!target) return <Redirect href="/browse" />;
  return <Redirect href={`/drama/${target}`} />;
}
