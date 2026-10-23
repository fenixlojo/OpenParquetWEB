import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import * as XLSX from "xlsx";
import { exportCsv, detectDelimiter } from "../src/convert-sql.js";

const require = createRequire(import.meta.url);
const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
const dist = dirname(require.resolve("@duckdb/duckdb-wasm"));
const db = await duckdb.createDuckDB(
  {
    mvp: { mainModule: join(dist, "duckdb-mvp.wasm") },
    eh: { mainModule: join(dist, "duckdb-eh.wasm") },
  },
  new duckdb.VoidLogger(),
  duckdb.NODE_RUNTIME,
);
await db.instantiate(() => {});
const connection = db.connect();
connection.query("LOAD parquet");
let counter = 0;
async function roundtrip(csv, options) {
  const input = `input_${counter++}.csv`,
    output = join(
      tmpdir(),
      `openparquet-test-${randomUUID()}.parquet`,
    ).replaceAll("\\", "/");
  db.registerFileText(input, csv);
  try {
    await exportCsv(connection, input, output, {
      ...options,
      delimiter: detectDelimiter(csv),
    });
    const bytes = db.copyFileToBuffer(output);
    return {
      bytes,
      rows: connection
        .query(`SELECT * FROM read_parquet('${output}')`)
        .toArray()
        .map((row) => row.toJSON()),
    };
  } finally {
    db.dropFile(input);
    db.dropFile(output);
    try {
      unlinkSync(output);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

test("CSV delimiter, unicode, multiline quotes, types and ZSTD round trip", async () => {
  const { rows, bytes } = await roundtrip(
    'persona_id;nombre;activo\n42325;"Ana\nPérez";true\n42326;Luis;false\n',
    { header: true },
  );
  assert.equal(
    bytes.slice(0, 4).toString(),
    new Uint8Array([80, 65, 82, 49]).toString(),
  );
  assert.deepEqual(rows, [
    { persona_id: 42325n, nombre: "Ana\nPérez", activo: true },
    { persona_id: 42326n, nombre: "Luis", activo: false },
  ]);
});
test("no-header CSV and explicit text mode preserve leading zeros", async () => {
  const { rows } = await roundtrip("00123,Ana\n00456,Luis\n", {
    header: false,
    allText: true,
  });
  assert.deepEqual(
    rows.map((row) => Object.values(row)),
    [
      ["00123", "Ana"],
      ["00456", "Luis"],
    ],
  );
});
test("repeated CSV data actually saves space; malformed CSV fails", async () => {
  const csv =
    "id,nombre\n" +
    Array.from({ length: 6000 }, (_, i) => `${i},persona repetida`).join("\n");
  const result = await roundtrip(csv, { header: true });
  assert.equal(result.rows.length, 6000);
  assert.ok(result.bytes.length < new TextEncoder().encode(csv).length);
  await assert.rejects(roundtrip('id,nombre\n1,"sin cerrar', { header: true }));
});

// Run the same message handler that Vite bundles as the Excel Web Worker.
let messages = [];
globalThis.self = { postMessage: (message) => messages.push(message) };
await import("../src/excel-worker.js");
async function message(data) {
  messages = [];
  await self.onmessage({ data });
  return messages.at(-1);
}
for (const format of ["xlsx", "xls"])
  test(`Excel ${format}: sheet selection, unicode, dates and values`, async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([["ignorar"], ["otra hoja"]]),
      "Primera",
    );
    const sheet = XLSX.utils.aoa_to_sheet([
      ["id", "nombre", "fecha"],
      ["00123", "José", 46318 + 12.5 / 24],
    ]);
    sheet.C2.z = "yyyy-mm-dd hh:mm:ss";
    XLSX.utils.book_append_sheet(book, sheet, "Elegida");
    const bytes = XLSX.write(book, {
      type: "array",
      bookType: format,
      cellDates: true,
    });
    const inspected = await message({
      action: "inspect",
      file: { arrayBuffer: async () => bytes },
    });
    assert.deepEqual(inspected.sheets, ["Primera", "Elegida"]);
    const converted = await message({ action: "convert", sheet: "Elegida" });
    assert.equal(converted.type, "result");
    const csvText = await converted.blob.text();
    assert.match(csvText, /2026-10-23 12:30:00/);
    const result = await roundtrip(csvText, { header: true, allText: true });
    assert.equal(result.rows[0].id, "00123");
    assert.equal(result.rows[0].nombre, "José");
    assert.match(result.rows[0].fecha, /2026-10-23 12:30:00/);
  });
test("Excel reports empty sheets and uncached formulas instead of silently dropping them", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, {}, "Vacía");
  XLSX.utils.book_append_sheet(
    book,
    { "!ref": "A1:A2", A1: { t: "s", v: "total" }, A2: { t: "n", f: "1+1" } },
    "Fórmulas",
  );
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  await message({
    action: "inspect",
    file: { arrayBuffer: async () => bytes },
  });
  assert.equal(
    (await message({ action: "convert", sheet: "Vacía" })).type,
    "error",
  );
  const formula = await message({ action: "convert", sheet: "Fórmulas" });
  assert.equal(formula.type, "error");
  assert.match(formula.error, /fórmulas/i);
});
