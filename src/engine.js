import * as duckdb from "@duckdb/duckdb-wasm";

const files = new Map();
let initialization;
let queue = Promise.resolve();
const serial = (operation) => {
  const task = queue.then(operation);
  queue = task.catch(() => {});
  return task;
};
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';

async function engine() {
  if (!initialization)
    initialization = (async () => {
      const base = new URL("/duckdb/", location.origin).href;
      const bundle = await duckdb.selectBundle({
        mvp: {
          mainModule: base + "duckdb-mvp.wasm",
          mainWorker: base + "duckdb-browser-mvp.worker.js",
        },
        eh: {
          mainModule: base + "duckdb-eh.wasm",
          mainWorker: base + "duckdb-browser-eh.worker.js",
        },
      });
      const worker = new Worker(bundle.mainWorker);
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
      try {
        await db.instantiate(bundle.mainModule);
        const connection = await db.connect();
        await connection.query("SET memory_limit='768MB'");
        await connection.query(
          `SET custom_extension_repository=${literal(base + "extensions")}`,
        );
        await connection.query("LOAD parquet");
        await connection.query("SET autoinstall_known_extensions=false");
        await connection.query("SET autoload_known_extensions=false");
        return { db, connection };
      } catch (error) {
        worker.terminate();
        throw error;
      }
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}

export function openFile(file) {
  return serial(async () => {
    if (!file.size) throw Error(`${file.name}: el archivo está vacío.`);
    const magic = new TextDecoder().decode(
      await file.slice(0, 4).arrayBuffer(),
    );
    if (magic !== "PAR1")
      throw Error(
        `${file.name}: no es un Parquet válido o está cifrado. Los Parquets cifrados no están admitidos.`,
      );
    const { db, connection } = await engine();
    const id = "f_" + crypto.randomUUID().replaceAll("-", "");
    const filename = id + ".parquet";
    try {
      // Browser FileReader reads ranges from the selected File without an upload.
      await db.registerFileHandle(
        filename,
        file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true,
      );
      const source = `read_parquet(${literal(filename)})`;
      const schema = await connection.query(`DESCRIBE SELECT * FROM ${source}`);
      const columns = schema
        .toArray()
        .map((row) => ({
          name: row.column_name,
          type: row.column_type,
          nullable: row.null,
        }));
      const count = await connection.query(
        `SELECT count(*) AS n FROM ${source}`,
      );
      const groups = await connection.query(
        `SELECT coalesce(max(row_group_id)+1,0) AS n FROM parquet_metadata(${literal(filename)})`,
      );
      const info = {
        id,
        name: file.name,
        size: file.size,
        rows: Number(count.get(0).n),
        columns,
        rowGroups: Number(groups.get(0).n),
      };
      files.set(id, { filename, source, info });
      return info;
    } catch (error) {
      await db.dropFile(filename).catch(() => {});
      throw Error(`${file.name}: ${error.message || error}`);
    }
  });
}

export function readRows(args) {
  return serial(async () => {
    const entry = files.get(args.id);
    if (!entry) throw Error("El archivo ya está cerrado.");
    const { connection } = await engine();
    const { source, info } = entry;
    const limit = Math.min(250, Math.max(1, Number(args.limit) || 100));
    const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
    const search = String(args.search || "");
    const where = search
      ? " WHERE " +
        info.columns
          .map(
            (c) =>
              `contains(lower(CAST(${identifier(c.name)} AS VARCHAR)),lower(${literal(search)}))`,
          )
          .join(" OR ")
      : "";
    const order = info.columns.some((c) => c.name === args.sort)
      ? ` ORDER BY ${identifier(args.sort)} ${args.desc === "1" ? "DESC" : "ASC"} NULLS LAST`
      : "";
    const total = search
      ? Number(
          (
            await connection.query(
              `SELECT count(*) AS n FROM ${source}${where}`,
            )
          ).get(0).n,
        )
      : info.rows;
    // Format in DuckDB to preserve BIGINT / DECIMAL precision and timestamp text.
    const projection = info.columns
      .map(
        (c) =>
          `CAST(${identifier(c.name)} AS VARCHAR) AS ${identifier(c.name)}`,
      )
      .join(",");
    // Sort in an inner query so numeric values retain numeric ordering.
    const table = await connection.query(
      `SELECT ${projection} FROM (SELECT * FROM ${source}${where}${order} LIMIT ${limit} OFFSET ${offset})`,
    );
    const rows = table
      .toArray()
      .map((row) =>
        info.columns.map((_, i) => row[table.schema.fields[i].name]),
      );
    return { rows, total };
  });
}

export function closeFile(id) {
  return serial(async () => {
    const entry = files.get(id);
    if (!entry) return;
    const { db } = await engine();
    await db.dropFile(entry.filename);
    files.delete(id);
  });
}
