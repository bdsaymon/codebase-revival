import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPublicDir = path.join(rootDir, ".output", "public");
const outputServerEntry = path.join(rootDir, ".output", "server", "index.mjs");
const distDir = path.join(rootDir, "dist");

async function renderRootHtmlFromServer() {
  const port = 43100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, [outputServerEntry], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      NITRO_PORT: String(port),
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
    },
    stdio: "ignore",
  });

  try {
    const url = `http://127.0.0.1:${port}/`;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const html = await res.text();
          if (html && html.includes("<html")) {
            return html;
          }
        }
      } catch {
        // Server still booting
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error("Timed out waiting for SSR server to render index.html");
  } finally {
    child.kill("SIGTERM");
  }
}

function buildFallbackHtml() {
  const assetsDir = path.join(outputPublicDir, "assets");
  const files = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
  const mainJs = files.find((f) => /^main-.*\.js$/.test(f));
  const stylesCss = files.find((f) => /^styles-.*\.css$/.test(f));
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SMFTA AI Pro</title>
    <meta name="description" content="SMFTA AI: direct answers, Mercury and custom providers, code editing, Notebook and persistent on-device memory." />
    <meta property="og:title" content="SMFTA AI Pro" />
    <meta property="og:description" content="SMFTA AI: direct answers, Mercury and custom providers, code editing, Notebook and persistent on-device memory." />
    <meta property="og:type" content="website" />
    <link rel="icon" href="/favicon.ico" />
    ${stylesCss ? `<link rel="stylesheet" href="/assets/${stylesCss}" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    ${mainJs ? `<script type="module" src="/assets/${mainJs}"></script>` : ""}
  </body>
</html>`;
}

async function main() {
  if (!fs.existsSync(outputPublicDir)) {
    throw new Error(`.output/public directory not found at ${outputPublicDir}`);
  }

  let indexHtml = "";
  try {
    indexHtml = await renderRootHtmlFromServer();
  } catch (err) {
    console.warn("[postbuild] Falling back to static index.html template:", err);
    indexHtml = buildFallbackHtml();
  }

  // Write index.html to .output/public/index.html
  fs.writeFileSync(path.join(outputPublicDir, "index.html"), indexHtml, "utf-8");

  // Sync .output/public/* into dist/ so both static and SSR deployments work
  fs.mkdirSync(distDir, { recursive: true });
  fs.cpSync(outputPublicDir, distDir, { recursive: true, force: true });

  console.log("[postbuild] Synced .output/public and index.html -> dist/");
}

main().catch((err) => {
  console.error("[postbuild] Failed:", err);
  process.exit(1);
});
