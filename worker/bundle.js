// Bundles worker.js with app.html + app.js inlined as raw strings.
// Output: .wrangler/bundle.js — ready for CF Workers Script Upload API.
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));
const projectRoot = path.resolve(root, "..");

function read(p) { return fs.readFileSync(path.join(projectRoot, p), "utf8"); }

const html = read("worker/app.html");
const js = read("worker/app.js");
const worker = read("worker/worker.js");
let nrosSrc = read("worker/nros.js");

// inline as backtick-safe strings
function quote(s) { return JSON.stringify(s); }

// Strip the `export` keywords from the federation module so it inlines as
// regular declarations inside worker.js.
nrosSrc = nrosSrc
  .replace(/^export\s+function\s+/gm, "function ")
  .replace(/^export\s+default\s+/gm, "");

const bundled = worker
  .replace("__NROS_MODULE__", `// ---- inlined from worker/nros.js ----\n${nrosSrc}\n// ---- end nros.js ----`)
  .replace("__APP_HTML__", quote(html))
  .replace("__APP_JS__", quote(js));

const outDir = path.join(projectRoot, ".wrangler");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "bundle.js");
fs.writeFileSync(outFile, bundled);

const sizeKb = (Buffer.byteLength(bundled, "utf8") / 1024).toFixed(1);
console.log(`Wrote ${outFile} (${sizeKb} KB)`);
