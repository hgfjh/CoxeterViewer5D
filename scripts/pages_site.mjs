import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const pagesBase = "/CoxeterViewer5D/";
export const pagesOutput = ".tmp/pages-dist";
export const pagesOrigin = `http://127.0.0.1:${process.env.COXETER_PAGES_PORT ?? "4180"}`;

const root = fileURLToPath(new URL(`../${pagesOutput}/`, import.meta.url));
const bundlePath = /^assets\/\w[\w.-]*-[\w-]+\.(js|css)$/;
const contentTypes = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
};

async function readArtifact() {
  const entries = await readdir(root, { withFileTypes: true });
  if (
    entries.length !== 2 ||
    !entries.some((entry) => entry.name === "index.html" && entry.isFile()) ||
    !entries.some((entry) => entry.name === "assets" && entry.isDirectory())
  ) {
    throw new Error(
      "Expected only index.html and assets/ in the Pages output.",
    );
  }
  const files = new Set(["index.html"]);
  for (const entry of await readdir(join(root, "assets"), {
    withFileTypes: true,
  })) {
    const path = `assets/${entry.name}`;
    if (!entry.isFile() || !bundlePath.test(path)) {
      throw new Error(`Unexpected Pages artifact: ${path}`);
    }
    files.add(path);
  }

  const html = await readFile(join(root, "index.html"), "utf8");
  const references = Array.from(
    html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g),
    ([, url]) => url,
  );
  for (const url of references) {
    if (!url.startsWith(pagesBase) || !files.has(url.slice(pagesBase.length))) {
      throw new Error(`Invalid asset URL in Pages index.html: ${url}`);
    }
  }
  for (const extension of [".js", ".css"]) {
    if (!references.some((url) => url.endsWith(extension))) {
      throw new Error(`Missing ${extension} in Pages index.html.`);
    }
  }
  return files;
}

async function main() {
  const files = await readArtifact();
  if (process.argv.includes("--verify")) {
    const configuredBase = process.env.COXETER_PAGES_CONFIGURED_BASE;
    if (configuredBase !== undefined && `${configuredBase}/` !== pagesBase) {
      throw new Error(
        `GitHub Pages reports base path ${JSON.stringify(configuredBase)}. Expected ${pagesBase}.`,
      );
    }
    let total = 0;
    for (const path of [...files].sort()) {
      const { size } = await stat(join(root, path));
      total += size;
      console.log(`${size.toString().padStart(9)}  ${path}`);
    }
    console.log(`${total} bytes across ${files.size} Pages files.`);
    return;
  }

  // Serve only real files under the project mount. A root asset URL or a
  // missing chunk must fail here as it would on Pages. Pages also serves
  // without the COOP/COEP headers used by the local Vite preview.
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url, pagesOrigin);
    if (pathname === pagesBase.slice(0, -1)) {
      response.writeHead(301, { Location: pagesBase }).end();
      return;
    }
    const path =
      pathname === pagesBase ? "index.html" : pathname.slice(pagesBase.length);
    if (!pathname.startsWith(pagesBase) || !files.has(path)) {
      response.writeHead(404).end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.split(".").at(-1)],
      "Cache-Control":
        path === "index.html" ? "no-cache" : "public, max-age=600",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(join(root, path));
    stream.on("error", () => response.destroy());
    response.on("close", () => stream.destroy());
    stream.pipe(response);
  });
  const { hostname, port } = new URL(pagesOrigin);
  server.listen(Number(port), hostname, () =>
    console.log(pagesOrigin + pagesBase),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
