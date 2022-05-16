import fs from "fs";
import path from "path";
import url from "url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

fs.renameSync(
  path.join(__dirname, "../cjs/index.js"),
  path.join(__dirname, "../lib/index.cjs"),
);
fs.rmSync(path.join(__dirname, "../cjs"), { recursive: true });
