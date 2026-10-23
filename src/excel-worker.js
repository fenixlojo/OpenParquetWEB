import * as XLSX from "xlsx";

let workbook;
const stringValue = (cell, date1904) => {
  if (!cell) return "";
  if (cell.f && cell.v == null)
    throw Error(
      "Hay fórmulas sin resultado guardado. Abrí el archivo en Excel, recalculá y guardalo antes de convertir.",
    );
  if (cell.t === "e")
    throw Error(
      cell.f
        ? "Hay fórmulas sin resultado válido guardado. Abrí el archivo en Excel, recalculá y guardalo antes de convertir."
        : "La hoja contiene una celda con error de Excel. Corregila antes de convertir.",
    );
  const value = cell.v;
  if (value == null) return "";
  if (value instanceof Date) {
    const pad = (n, width = 2) => String(n).padStart(width, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${pad(value.getMilliseconds(), 3)}`;
  }
  if (cell.t === "n" && XLSX.SSF.is_date(cell.z || "")) {
    const date = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!date) throw Error("Hay una fecha de Excel que no se puede convertir.");
    const pad = (n, width = 2) => String(n).padStart(width, "0");
    const clock = `${pad(date.H)}:${pad(date.M)}:${pad(date.S)}.${pad(Math.round(date.u * 1000), 3)}`;
    return date.d === 0
      ? clock
      : `${date.y}-${pad(date.m)}-${pad(date.d)} ${clock}`;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};
const csvCell = (value) => '"' + value.replaceAll('"', '""') + '"';

self.onmessage = async ({ data }) => {
  try {
    if (data.action === "inspect") {
      workbook = XLSX.read(await data.file.arrayBuffer(), {
        type: "array",
        cellDates: false,
        cellNF: true,
      });
      self.postMessage({ type: "result", sheets: workbook.SheetNames });
    } else if (data.action === "convert") {
      const sheet = workbook?.Sheets[data.sheet];
      if (!sheet || !sheet["!ref"])
        throw Error("La hoja seleccionada está vacía.");
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      const chunks = [];
      let lines = [],
        count = 0;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const values = [];
        for (let c = range.s.c; c <= range.e.c; c++)
          values.push(
            stringValue(
              sheet[XLSX.utils.encode_cell({ r, c })],
              workbook.Workbook?.WBProps?.date1904,
            ),
          );
        if (values.some((value) => value !== "")) {
          lines.push(values.map(csvCell).join(",") + "\n");
          count++;
        }
        if (r % 1000 === 0) {
          chunks.push(lines.join(""));
          lines = [];
          self.postMessage({
            type: "progress",
            step: 0,
            label: `Leyendo hoja: fila ${r - range.s.r + 1} de ${range.e.r - range.s.r + 1}…`,
          });
        }
      }
      if (!count) throw Error("La hoja seleccionada está vacía.");
      chunks.push(lines.join(""));
      self.postMessage({
        type: "result",
        blob: new Blob(chunks, { type: "text/csv;charset=utf-8" }),
      });
    }
  } catch (error) {
    self.postMessage({ type: "error", error: error.message || String(error) });
  }
};
