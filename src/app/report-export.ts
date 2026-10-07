// Exportação dos relatórios: CSV (sheet.ts), XLSX e PDF — tudo gerado no navegador, a partir
// dos números já calculados (nada sai para outro serviço).

import { loadPdfLib } from "./pdflib";

export type ExportTable = { name: string; headers: string[]; rows: (string | number)[][] };

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- XLSX mínimo: ZIP sem compressão + SpreadsheetML (texto inline, números como número) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(8, 0, true); // sem compressão
    head.setUint32(14, crc, true);
    head.setUint32(18, f.data.length, true);
    head.setUint32(22, f.data.length, true);
    head.setUint16(26, name.length, true);
    local.push(new Uint8Array(head.buffer), name, f.data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, f.data.length, true);
    dir.setUint32(24, f.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

const xml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function col(i: number) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(t: ExportTable) {
  const rows = [t.headers, ...t.rows].map(
    (r, ri) =>
      `<row r="${ri + 1}">${r
        .map((v, ci) => {
          const ref = `${col(ci)}${ri + 1}`;
          return typeof v === "number" && Number.isFinite(v)
            ? `<c r="${ref}"><v>${v}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t>${xml(String(v ?? ""))}</t></is></c>`;
        })
        .join("")}</row>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

export function toXlsx(tables: ExportTable[]): Blob {
  const enc = new TextEncoder();
  const safe = (n: string, i: number) =>
    n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Aba ${i + 1}`;
  const files = [
    {
      name: "[Content_Types].xml",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("")}</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables
          .map(
            (t, i) =>
              `<sheet name="${xml(safe(t.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join("")}</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("")}</Relationships>`,
      ),
    },
    ...tables.map((t, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: enc.encode(sheetXml(t)),
    })),
  ];
  return new Blob([zip(files) as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---- PDF: título, período e as tabelas, em páginas A4 ----

type Font = {
  widthOfTextAtSize: (t: string, s: number) => number;
  encodeText: (t: string) => unknown;
};
type Page = {
  drawText: (t: string, o: Record<string, unknown>) => void;
  drawLine: (o: Record<string, unknown>) => void;
};
type Lib = {
  PDFDocument: {
    create: () => Promise<{
      addPage: (size: [number, number]) => Page;
      embedFont: (f: string) => Promise<Font>;
      save: () => Promise<Uint8Array>;
    }>;
  };
  StandardFonts: { Helvetica: string; HelveticaBold: string };
  rgb: (r: number, g: number, b: number) => unknown;
};

export async function toPdf(title: string, subtitle: string, tables: ExportTable[]): Promise<Blob> {
  const lib = (await loadPdfLib()) as unknown as Lib;
  const doc = await lib.PDFDocument.create();
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  const ink = lib.rgb(0.1, 0.1, 0.15);
  const muted = lib.rgb(0.42, 0.42, 0.48);
  // Helvetica (WinAnsi) não tem todos os caracteres: troca os que faltam.
  const clean = (f: Font, s: string) =>
    [...s]
      .map((ch) => {
        try {
          f.encodeText(ch);
          return ch;
        } catch {
          return "?";
        }
      })
      .join("");
  const fit = (f: Font, s: string, size: number, width: number) => {
    let out = clean(f, s);
    while (out.length > 1 && f.widthOfTextAtSize(out, size) > width) out = `${out.slice(0, -2)}…`;
    return out;
  };
  const W = 595.28;
  const H = 841.89;
  const M = 40;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const ensure = (h: number) => {
    if (y - h < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  page.drawText(clean(bold, title), { x: M, y: y - 18, size: 18, font: bold, color: ink });
  y -= 30;
  page.drawText(clean(font, subtitle), { x: M, y: y - 10, size: 10, font, color: muted });
  y -= 28;
  for (const t of tables) {
    ensure(40);
    page.drawText(clean(bold, t.name), { x: M, y: y - 12, size: 12, font: bold, color: ink });
    y -= 22;
    const width = (W - 2 * M) / Math.max(1, t.headers.length);
    const row = (cells: (string | number)[], f: Font) => {
      ensure(16);
      cells.forEach((c, i) =>
        page.drawText(fit(f, String(c ?? ""), 9, width - 6), {
          x: M + i * width,
          y: y - 10,
          size: 9,
          font: f,
          color: ink,
        }),
      );
      y -= 15;
    };
    row(t.headers, bold);
    page.drawLine({
      start: { x: M, y: y + 3 },
      end: { x: W - M, y: y + 3 },
      thickness: 0.5,
      color: muted,
    });
    for (const r of t.rows) row(r, font);
    y -= 12;
  }
  return new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" });
}
