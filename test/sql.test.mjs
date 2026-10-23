import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { buildQuery, executeSelect } from "../src/sql.js";

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
const source = `(SELECT i+42300 AS persona_id, i%3 AS grupo, CASE WHEN i=25 THEN NULL ELSE 'O''Brien; SELECT' END AS nombre, (9007199254740993+i)::BIGINT AS grande FROM range(230) t(i))`;

test("fixed table, MySQL identifiers, filtering, precision and schema", async () => {
  const result = await executeSelect(connection, source, {
    projection: "`persona_id`, grande, nombre",
    clauses: "WHERE persona_id = 42325",
  });
  assert.equal(result.total, 1);
  assert.deepEqual(result.rows, [["42325", "9007199254741018", null]]);
  assert.deepEqual(
    result.columns.map((c) => c.name),
    ["persona_id", "grande", "nombre"],
  );
});
test("numeric order and pagination over the full filtered result", async () => {
  const args = {
    projection: "persona_id",
    clauses: "WHERE persona_id >= 42325 ORDER BY persona_id DESC",
    limit: "50",
    offset: "50",
  };
  const result = await executeSelect(connection, source, args);
  assert.equal(result.total, 205);
  assert.equal(result.rows.length, 50);
  assert.equal(result.rows[0][0], "42479");
});
test("grouping, aliases, HAVING, LIMIT and sorting result columns", async () => {
  const result = await executeSelect(connection, source, {
    projection: "grupo, COUNT(*) AS cantidad",
    clauses: "GROUP BY grupo HAVING COUNT(*) > 70 ORDER BY grupo LIMIT 2",
    sort: "cantidad",
    desc: "1",
  });
  assert.equal(result.total, 2);
  assert.deepEqual(result.rows, [
    ["0", "77"],
    ["1", "77"],
  ]);
});
test("empty result retains schema and escaped string literals remain data", async () => {
  const empty = await executeSelect(connection, source, {
    projection: "persona_id",
    clauses: "WHERE persona_id = -1",
  });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.columns[0].name, "persona_id");
  const escaped = await executeSelect(connection, source, {
    projection: "COUNT(*) AS total",
    clauses: "WHERE nombre = 'O''Brien; SELECT'",
  });
  assert.deepEqual(escaped.rows, [["229"]]);
});
test("rejects source changes, additional statements, comments and unclosed quotes", () => {
  for (const tail of [
    "WHERE 1=1; DROP TABLE parquet",
    "WHERE EXISTS (SELECT 1 FROM x)",
    "JOIN otra ON true",
    "WHERE 1=1 -- comment",
    "WHERE nombre='bad",
    "WHERE nombre=$$value$$",
  ])
    assert.throws(() => buildQuery("*", tail));
  assert.throws(() => buildQuery("* FROM read_csv('secret')", ""));
});
