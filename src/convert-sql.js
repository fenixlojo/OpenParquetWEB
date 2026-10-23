export async function exportCsv(connection, input, output, options) {
  const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
  const delimiter = [",", ";", "\t", "|"].includes(options.delimiter)
    ? options.delimiter
    : ",";
  const source = `read_csv(${literal(input)}, delim=${literal(delimiter)}, quote='"', escape='"', header=${!!options.header}, all_varchar=${!!options.allText}, sample_size=-1, ignore_errors=false, strict_mode=true)`;
  await connection.query(
    `COPY (SELECT * FROM ${source}) TO ${literal(output)} (FORMAT PARQUET, COMPRESSION ZSTD)`,
  );
}

export function detectDelimiter(text) {
  text = text.replace(/^\uFEFF/, "").replace(/^[\r\n]+/, "");
  const counts = new Map([
    [",", 0],
    [";", 0],
    ["\t", 0],
    ["|", 0],
  ]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if ((text[i] === "\n" || text[i] === "\r") && i > 0) break;
      if (counts.has(text[i])) counts.set(text[i], counts.get(text[i]) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
