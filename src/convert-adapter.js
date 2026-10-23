import { csvToParquet } from "./engine.js";
import { detectDelimiter } from "./convert-sql.js";

function callWorker(worker, message, progress = () => {}) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      worker.onmessage = null;
      worker.onerror = null;
    };
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") progress(data);
      else if (data.type === "error") {
        finish();
        reject(Error(data.error));
      } else {
        finish();
        resolve(data);
      }
    };
    worker.onerror = () => {
      finish();
      reject(
        Error(
          "No se pudo leer el Excel. Puede estar dañado, cifrado o superar la memoria del navegador.",
        ),
      );
    };
    worker.postMessage(message);
  });
}

export async function inspectSource(file) {
  const excel = /\.(xlsx|xls|xlsm)$/i.test(file.name);
  if (!excel && !/\.(csv|tsv)$/i.test(file.name))
    throw Error("Elegí un CSV, TSV o Excel (.xlsx, .xls, .xlsm).");
  if (!file.size) throw Error("El archivo está vacío.");
  if (!excel) return { file, sheets: [], excel: false };
  const worker = new Worker(new URL("./excel-worker.js", import.meta.url), {
    type: "module",
  });
  try {
    const result = await callWorker(worker, { action: "inspect", file });
    return { file, sheets: result.sheets, excel: true, worker };
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

export async function convertSource(source, options, progress) {
  let csv = source.file;
  if (source.excel) {
    const result = await callWorker(
      source.worker,
      { action: "convert", sheet: options.sheet },
      progress,
    );
    csv = new File([result.blob], "sheet.csv");
  } else if (options.encoding === "windows-1252") {
    progress({ step: 0, label: "Decodificando CSV como Windows-1252…" });
    csv = new File(
      [new TextDecoder("windows-1252").decode(await csv.arrayBuffer())],
      "source.csv",
    );
  }
  progress({
    step: 1,
    label: "Datos de origen listos. Preparando la compresión…",
  });
  const delimiter = detectDelimiter(await csv.slice(0, 262144).text());
  const blob = await csvToParquet(csv, { ...options, delimiter }, progress);
  return {
    blob,
    originalSize: source.file.size,
    outputSize: blob.size,
    name:
      source.file.name.replace(/\.[^.]+$/, "") +
      (source.excel
        ? "_" + options.sheet.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        : "") +
      ".parquet",
  };
}

export function discardSource(source) {
  source?.worker?.terminate();
}
