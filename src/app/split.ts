// Separação de um PDF com vários documentos e associação de cada parte ao destinatário
// (envio em massa). Regras determinísticas: CPF > matrícula > e-mail > identificador
// configurado; o nome sozinho nunca identifica com segurança.

import { isValidCpf, onlyDigits } from "./validation";

export type SplitMode = "page" | "fixed" | "content" | "manual";
export type SplitRule = { mode: SplitMode; size?: number; ranges?: string };
export type IdentifyRule = { matricula: boolean; customLabel?: string };

export type Person = {
  key: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  matricula: string;
  custom: string;
};

export type Method = "cpf" | "matricula" | "email" | "custom" | "manual";
export type Confidence = "green" | "yellow" | "red";

export type Found = { cpfs: string[]; emails: string[]; matriculas: string[]; customs: string[] };

export type SplitDoc = {
  index: number;
  from: number;
  to: number;
  found: Found;
  confidence: Confidence;
  method: Method;
  value: string;
  personKey: string | null;
  candidates: string[];
  reason:
    "ok" | "name_only" | "multiple" | "conflict" | "not_found" | "no_contact" | "unlinked_pages";
  confirmed: boolean;
  excluded: boolean;
};

export const normalizeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const unique = <T>(list: T[]) => [...new Set(list)];

/** CPFs válidos (dígito verificador) no texto, só dígitos. */
export function cpfsInText(text: string): string[] {
  return unique(
    [...text.matchAll(/(?<!\d)(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})(?!\d)/g)]
      .map((m) => `${m[1]}${m[2]}${m[3]}${m[4]}`)
      .filter(isValidCpf),
  );
}

export function emailsInText(text: string): string[] {
  return unique(
    [...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) =>
      m[0].toLowerCase(),
    ),
  );
}

export type PeopleIndex = {
  byCpf: Map<string, string[]>;
  byEmail: Map<string, string[]>;
  byMatricula: Map<string, string[]>;
  byCustom: Map<string, string[]>;
  people: Map<string, Person>;
};

function add(map: Map<string, string[]>, k: string, v: string) {
  if (!k) return;
  map.set(k, unique([...(map.get(k) ?? []), v]));
}

export function indexPeople(people: Person[]): PeopleIndex {
  const idx: PeopleIndex = {
    byCpf: new Map(),
    byEmail: new Map(),
    byMatricula: new Map(),
    byCustom: new Map(),
    people: new Map(people.map((p) => [p.key, p])),
  };
  for (const p of people) {
    add(idx.byCpf, onlyDigits(p.cpf), p.key);
    add(idx.byEmail, p.email.trim().toLowerCase(), p.key);
    add(idx.byMatricula, p.matricula.trim().toLowerCase(), p.key);
    add(idx.byCustom, p.custom.trim().toLowerCase(), p.key);
  }
  return idx;
}

const tokens = (text: string) =>
  unique(
    (text.match(/[\p{L}\p{N}][\p{L}\p{N}./-]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu) ?? []).map((t) =>
      t.toLowerCase(),
    ),
  );

/** Identificadores encontrados no texto de uma página. */
export function findInText(text: string, idx: PeopleIndex, rule: IdentifyRule): Found {
  const toks = rule.matricula || rule.customLabel ? tokens(text) : [];
  const customs: string[] = [];
  if (rule.customLabel?.trim()) {
    const label = rule.customLabel.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const m of text.matchAll(
      new RegExp(`${label}\\s*[:\\-–]?\\s*([\\p{L}\\p{N}./-]+)`, "giu"),
    ))
      customs.push(m[1]!.toLowerCase());
  }
  return {
    cpfs: cpfsInText(text),
    emails: emailsInText(text),
    matriculas: rule.matricula ? toks.filter((t) => idx.byMatricula.has(t)) : [],
    customs: unique(customs),
  };
}

const merge = (a: Found, b: Found): Found => ({
  cpfs: unique([...a.cpfs, ...b.cpfs]),
  emails: unique([...a.emails, ...b.emails]),
  matriculas: unique([...a.matriculas, ...b.matriculas]),
  customs: unique([...a.customs, ...b.customs]),
});
const empty = (): Found => ({ cpfs: [], emails: [], matriculas: [], customs: [] });

/** "1-2, 3, 5-7" → [[1,2],[3,3],[5,7]]. Devolve null se houver erro ou sobreposição. */
export function parseRanges(input: string, pages: number): [number, number][] | null {
  const out: [number, number][] = [];
  const used = new Set<number>();
  for (const part of input.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return null;
    const from = Number(m[1]);
    const to = Number(m[2] ?? m[1]);
    if (from < 1 || to < from || to > pages) return null;
    for (let p = from; p <= to; p++) {
      if (used.has(p)) return null;
      used.add(p);
    }
    out.push([from, to]);
  }
  return out.length ? out : null;
}

/** Chave que identifica de quem é a página (para separar pelo conteúdo). */
function pageOwner(f: Found, idx: PeopleIndex): string | null {
  if (f.cpfs.length === 1) return `cpf:${f.cpfs[0]}`;
  if (f.matriculas.length === 1) return `mat:${f.matriculas[0]}`;
  if (f.customs.length === 1) return `id:${f.customs[0]}`;
  const emails = f.emails.filter((e) => idx.byEmail.has(e));
  if (emails.length === 1) return `mail:${emails[0]}`;
  return null;
}

/** Pessoas conhecidas cujo nome completo aparece no texto. */
function namesIn(text: string, idx: PeopleIndex): string[] {
  const norm = ` ${normalizeName(text)} `;
  return [...idx.people.values()]
    .filter((p) => {
      const n = normalizeName(p.name);
      return n.split(" ").length >= 2 && norm.includes(` ${n} `);
    })
    .map((p) => p.key);
}

/** Pessoas a quem um "dono" de página (cpf:/mat:/id:/mail:) corresponde. */
function ownerKeys(owner: string, idx: PeopleIndex): string[] {
  const [kind, ...rest] = owner.split(":");
  const v = rest.join(":");
  const map =
    kind === "cpf"
      ? idx.byCpf
      : kind === "mat"
        ? idx.byMatricula
        : kind === "id"
          ? idx.byCustom
          : idx.byEmail;
  return map.get(v) ?? [];
}

/** Intervalos de páginas de cada documento, conforme a regra. */
export function splitRanges(
  pages: number,
  rule: SplitRule,
  pageFound: Found[],
  idx: PeopleIndex,
  pageTexts: string[] = [],
): [number, number][] | null {
  if (rule.mode === "page") return Array.from({ length: pages }, (_, i) => [i + 1, i + 1]);
  if (rule.mode === "fixed") {
    const n = Math.max(1, Math.trunc(rule.size ?? 1));
    const out: [number, number][] = [];
    for (let p = 1; p <= pages; p += n) out.push([p, Math.min(p + n - 1, pages)]);
    return out;
  }
  if (rule.mode === "manual") return parseRanges(rule.ranges ?? "", pages);
  // Pelo conteúdo: um novo documento começa quando aparece outra pessoa — pelo identificador
  // ou, numa página sem identificador, pelo nome completo de outra pessoa conhecida.
  // Assim a página de alguém nunca é anexada, em silêncio, ao documento de outra pessoa.
  const out: [number, number][] = [];
  let owner: string | null = null;
  let people: string[] = [];
  for (let p = 1; p <= pages; p++) {
    const o = pageOwner(pageFound[p - 1] ?? empty(), idx);
    let start = out.length === 0;
    // Outro identificador: outra pessoa. Se o documento atual ainda não tem identificador
    // (começou pelo nome), só continua se o identificador for da mesma pessoa.
    if (!start && o && o !== owner && (owner || !ownerKeys(o, idx).some((k) => people.includes(k))))
      start = true;
    if (!start && !o) {
      const names = namesIn(pageTexts[p - 1] ?? "", idx);
      if (names.some((k) => !people.includes(k))) {
        start = true;
        owner = null;
        people = names;
      }
    }
    if (start) out.push([p, p]);
    else out[out.length - 1]![1] = p;
    if (o) {
      owner = o;
      people = ownerKeys(o, idx);
    } else if (start && out.length === 1) people = namesIn(pageTexts[p - 1] ?? "", idx);
  }
  return out;
}

/** Associa um documento a uma pessoa e classifica (verde / amarelo / vermelho). */
export function matchDoc(found: Found, text: string, idx: PeopleIndex) {
  const tries: [Method, string[], Map<string, string[]>][] = [
    ["cpf", found.cpfs, idx.byCpf],
    ["matricula", found.matriculas, idx.byMatricula],
    ["email", found.emails, idx.byEmail],
    ["custom", found.customs, idx.byCustom],
  ];
  const hits = tries.map(([method, values, map]) => {
    const keys = unique(values.flatMap((v) => map.get(v) ?? []));
    const value = values.find((v) => (map.get(v) ?? []).length) ?? "";
    return { method, keys, value };
  });
  const first = hits.find((h) => h.keys.length);
  if (first) {
    if (first.keys.length > 1)
      return {
        confidence: "yellow" as const,
        method: first.method,
        value: first.value,
        personKey: null,
        candidates: first.keys,
        reason: "multiple" as const,
      };
    const key = first.keys[0]!;
    // Outro identificador do mesmo documento aponta para outra pessoa: conflito.
    const conflict = hits.some((h) => h.keys.length && h.keys.some((k) => k !== key));
    return {
      confidence: conflict ? ("yellow" as const) : ("green" as const),
      method: first.method,
      value: first.value,
      personKey: key,
      candidates: unique(hits.flatMap((h) => h.keys)),
      reason: conflict ? ("conflict" as const) : ("ok" as const),
    };
  }
  // Só o nome: possível correspondência, exige confirmação.
  const norm = ` ${normalizeName(text)} `;
  const byName = [...idx.people.values()]
    .filter(
      (p) =>
        normalizeName(p.name).split(" ").length >= 2 && norm.includes(` ${normalizeName(p.name)} `),
    )
    .map((p) => p.key);
  if (byName.length)
    return {
      confidence: "yellow" as const,
      method: "manual" as const,
      value: "",
      personKey: byName.length === 1 ? byName[0]! : null,
      candidates: byName,
      reason: byName.length === 1 ? ("name_only" as const) : ("multiple" as const),
    };
  return {
    confidence: "red" as const,
    method: "manual" as const,
    value: "",
    personKey: null,
    candidates: [],
    reason:
      found.cpfs.length || found.emails.length ? ("no_contact" as const) : ("not_found" as const),
  };
}

/** Página "ligada" ao dono do documento: tem um identificador ou o nome completo dele. */
function pageLinked(text: string, found: Found, person: Person | undefined, idx: PeopleIndex) {
  if (pageOwner(found, idx)) return true;
  if (!person) return false;
  const n = normalizeName(person.name);
  return n.split(" ").length >= 2 && ` ${normalizeName(text)} `.includes(` ${n} `);
}

/** Identifica uma parte (usado também ao separar um documento na conferência). */
export function identifyRange(
  from: number,
  to: number,
  pageTexts: string[],
  pageFound: Found[],
  idx: PeopleIndex,
  index: number,
): SplitDoc {
  let found = empty();
  for (let p = from; p <= to; p++) found = merge(found, pageFound[p - 1] ?? empty());
  const text = pageTexts.slice(from - 1, to).join("\n");
  const match = matchDoc(found, text, idx);
  // Páginas sem identificador e sem o nome do dono: não dá para garantir de quem são.
  const person = match.personKey ? idx.people.get(match.personKey) : undefined;
  let unlinked = false;
  for (let p = from; p <= to; p++)
    if (!pageLinked(pageTexts[p - 1] ?? "", pageFound[p - 1] ?? empty(), person, idx))
      unlinked = true;
  const downgraded =
    unlinked && to > from && match.confidence === "green"
      ? { confidence: "yellow" as const, reason: "unlinked_pages" as const }
      : {};
  return { index, from, to, found, ...match, ...downgraded, confirmed: false, excluded: false };
}

export type Analysis = { pageFound: Found[]; idx: PeopleIndex };

export function analyze(pageTexts: string[], identify: IdentifyRule, people: Person[]): Analysis {
  const idx = indexPeople(people);
  return { idx, pageFound: pageTexts.map((t) => findInText(t, idx, identify)) };
}

/** Separa e identifica: um SplitDoc por documento. */
export function buildDocs(
  pageTexts: string[],
  rule: SplitRule,
  identify: IdentifyRule,
  people: Person[],
): SplitDoc[] | null {
  const { idx, pageFound } = analyze(pageTexts, identify, people);
  const ranges = splitRanges(pageTexts.length, rule, pageFound, idx, pageTexts);
  if (!ranges) return null;
  return ranges.map(([from, to], index) =>
    identifyRange(from, to, pageTexts, pageFound, idx, index),
  );
}

/** Divide um documento em dois a partir da página `at` (conferência manual). */
export function splitDocAt(
  docs: SplitDoc[],
  index: number,
  at: number,
  pageTexts: string[],
  analysis: Analysis,
): SplitDoc[] {
  const doc = docs.find((d) => d.index === index);
  if (!doc || at <= doc.from || at > doc.to) return docs;
  const next = Math.max(...docs.map((d) => d.index)) + 1;
  const a = identifyRange(doc.from, at - 1, pageTexts, analysis.pageFound, analysis.idx, doc.index);
  const b = identifyRange(at, doc.to, pageTexts, analysis.pageFound, analysis.idx, next);
  return docs.flatMap((d) => (d.index === index ? [a, b] : [d])).sort((x, y) => x.from - y.from);
}

/** Pronto para enviar: verde, ou tratado explicitamente (confirmado com pessoa). */
export const isReady = (d: SplitDoc) =>
  !d.excluded && d.personKey !== null && (d.confidence === "green" || d.confirmed);
export const isPending = (d: SplitDoc) => !d.excluded && !isReady(d);
