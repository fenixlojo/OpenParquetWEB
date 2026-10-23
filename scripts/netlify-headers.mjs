import { readFile, writeFile } from "node:fs/promises";
// Header blocks use only quoted string values; fail if this convention changes.
const config = await readFile(
  new URL("../netlify.toml", import.meta.url),
  "utf8",
);
let result = "";
for (const block of config.split("[[headers]]").slice(1)) {
  const route = block.match(/for = "([^"]+)"/);
  if (!route) throw Error("Header block missing route");
  result += route[1] + "\n";
  for (const line of block.split("[headers.values]")[1].trim().split("\n")) {
    const match = line.trim().match(/^([\w-]+) = "(.*)"$/);
    if (!match) throw Error("Unsupported header line: " + line);
    result += `  ${match[1]}: ${match[2]}\n`;
  }
}
await writeFile(new URL("../dist/_headers", import.meta.url), result);
