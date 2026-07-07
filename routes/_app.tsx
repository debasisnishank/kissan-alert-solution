import { type PageProps } from "$fresh/server.ts";

export default function App({ Component }: PageProps) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Compass - Smart Farming Advisory Platform</title>
        <link rel="stylesheet" href="/styles.css" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#16a34a" />
      </head>
      <body>
        <Component />
        <script
          dangerouslySetInnerHTML={{
            __html:
              `if ("serviceWorker" in navigator) { window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js")); }`,
          }}
        />
      </body>
    </html>
  );
}
