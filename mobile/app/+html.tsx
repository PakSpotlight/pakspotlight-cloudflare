import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * The web preview's HTML shell (Expo Router only applies this file on web).
 * It exists to paint the canvas black before React mounts — without it the browser flashes white
 * on every reload of http://localhost:8081.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ backgroundColor: "#000000" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Classic TV Pakistan</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body{background-color:#000000;color:#fff}body{overflow:hidden}#root{display:flex;height:100%;flex:1}`,
          }}
        />
      </head>
      <body style={{ backgroundColor: "#000000" }}>{children}</body>
    </html>
  );
}
