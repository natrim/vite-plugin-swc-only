import fs from "fs";
import path from "path";
import url from "url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

if (!fs.existsSync(path.join(__dirname, "../cjs")))
  fs.mkdirSync(path.join(__dirname, "../cjs"));

const file = fs.readFileSync(path.join(__dirname, "../lib/index.ts"));
fs.writeFileSync(
  path.join(__dirname, "../cjs/index.ts"),
  file
    .toString()
    .replace(
      /((\/\/|\/\*) ?@cjs_start([\s\S]+?)(\/\/)? ?@cjs_end ?(\*\/)?)/gim,
      "",
    ),
);
