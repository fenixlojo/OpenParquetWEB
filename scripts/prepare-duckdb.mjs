import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const distribution = dirname(require.resolve("@duckdb/duckdb-wasm"));
const target = new URL("../public/duckdb/", import.meta.url);
await mkdir(target, { recursive: true });
for (const filename of [
  "duckdb-mvp.wasm",
  "duckdb-eh.wasm",
  "duckdb-browser-mvp.worker.js",
  "duckdb-browser-eh.worker.js",
]) {
  await copyFile(join(distribution, filename), new URL(filename, target));
}
// Extensions must match the embedded DuckDB version, not the npm version.
const bindings = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
const db = await bindings.createDuckDB(
  {
    mvp: { mainModule: join(distribution, "duckdb-mvp.wasm") },
    eh: { mainModule: join(distribution, "duckdb-eh.wasm") },
  },
  new bindings.VoidLogger(),
  bindings.NODE_RUNTIME,
);
await db.instantiate(() => {});
const version = db.getVersion();
for (const platform of ["wasm_mvp", "wasm_eh"]) {
  const suffix = `${version}/${platform}/parquet.duckdb_extension.wasm`;
  const output = new URL(`extensions/${suffix}`, target);
  try {
    const cached = await readFile(output);
    if (cached.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) continue;
  } catch {
    /* Download missing build asset. */
  }
  console.log(`Preparing Parquet extension: ${version}/${platform}`);
  const response = await fetch(`https://extensions.duckdb.org/${suffix}`);
  if (!response.ok)
    throw Error(`Extension download failed: ${response.status} ${suffix}`);
  const binary = Buffer.from(await response.arrayBuffer());
  if (!binary.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])))
    throw Error("Invalid extension binary");
  await mkdir(new URL(".", output), { recursive: true });
  await writeFile(output, binary);
}
