// Leitura de planilhas no navegador para o envio em massa (PRD §17): CSV e XLSX.
// O arquivo não sai do navegador; só as linhas mapeadas vão para o servidor.

export type Sheet = { headers: string[]; rows: string[][] };

const MAX_ROWS = 1000;

/** CSV com vírgula ou ponto e vírgula (Excel em pt-BR), aspas e quebras de linha em células. */
export function parseCsv(text: string): Sheet {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return toSheet(out);
}

function toSheet(matrix: string[][]): Sheet {
  const nonEmpty = matrix.filter((r) => r.some((c) => c.trim()));
  const [head = [], ...rows] = nonEmpty;
  const headers = head.map((h, i) => h.trim() || `#${i + 1}`);
  return {
    headers,
    rows: rows.slice(0, MAX_ROWS + 1).map((r) => headers.map((_, i) => (r[i] ?? "").trim())),
  };
}

// ---- XLSX: ZIP (central directory) + XML ----

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as BodyInit).body!.pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, () => Promise<string>>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("zip");
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const files = new Map<string, () => Promise<string>>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("zip");
    const method = view.getUint16(ptr + 10, true);
    const size = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const local = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    files.set(name, async () => decoder.decode(method === 8 ? await inflate(raw) : raw));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Por nome local: alguns sistemas gravam o XML com prefixo (<x:row>, <x:c>).
const tags = (el: Document | Element, name: string) => [...el.getElementsByTagNameNS("*", name)];

const textOf = (el: Element) =>
  tags(el, "t")
    .map((t) => t.textContent ?? "")
    .join("");

export async function parseXlsx(buffer: ArrayBuffer): Promise<Sheet> {
  const files = await unzip(buffer);
  const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");

  // Primeira aba do arquivo, pela ordem do workbook.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = files.get("xl/workbook.xml");
  const rels = files.get("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const first = tags(xml(await workbook()), "sheet")[0];
    const rid =
      first?.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      ) ?? first?.getAttribute("r:id");
    const rel = tags(xml(await rels()), "Relationship").find((r) => r.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }
  const sheetFile = files.get(sheetPath);
  if (!sheetFile) throw new Error("xlsx");

  const shared: string[] = [];
  const sst = files.get("xl/sharedStrings.xml");
  if (sst) for (const si of tags(xml(await sst()), "si")) shared.push(textOf(si));

  const matrix: string[][] = [];
  for (const row of tags(xml(await sheetFile()), "row")) {
    const cells: string[] = [];
    for (const c of tags(row, "c")) {
      const type = c.getAttribute("t");
      const v = tags(c, "v")[0]?.textContent ?? "";
      const value =
        type === "s"
          ? (shared[Number(v)] ?? "")
          : type === "inlineStr"
            ? textOf(c)
            : type === "b"
              ? v === "1"
                ? "true"
                : "false"
              : v;
      cells[colIndex(c.getAttribute("r") ?? "A")] = value;
    }
    matrix.push(Array.from(cells, (x) => x ?? ""));
  }
  return toSheet(matrix);
}

export async function readSheet(file: File): Promise<Sheet> {
  if (/\.xlsx$/i.test(file.name)) return parseXlsx(await file.arrayBuffer());
  return parseCsv(await file.text());
}

/** Datas do Excel chegam como número de série (dias desde 30/12/1899). */
export function excelSerialToIso(value: string): string | null {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  if (n < 20000 || n > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Gera CSV (separador ;) para baixar — pendências, erros, planilha de exemplo. */
export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `\uFEFF${[headers, ...rows].map((r) => r.map((c) => esc(c ?? "")).join(";")).join("\r\n")}`;
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Compara nomes de coluna ignorando acentos, caixa e separadores. */
export const normalizeHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
