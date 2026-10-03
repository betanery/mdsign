import {
  Building2,
  FilePlus2,
  FileText,
  FolderClosed,
  KeyRound,
  Search,
  ShieldCheck,
  Files,
  FileStack,
} from "lucide-react";

import { logoIcon } from "./logo";

/**
 * Representação da tela de documentos do MDSign com dados fictícios
 * (nomes de documento aprovados no PRD, seção 2.2). Feita em HTML para ficar
 * nítida em qualquer tela e não exibir dados reais. O conteúdo da tela fica em
 * português em todos os idiomas, como uma captura do produto (PRD 27.5).
 */
const menu = [
  { icon: FilePlus2, label: "Novo documento", active: true },
  { icon: Files, label: "Documentos" },
  { icon: FolderClosed, label: "Pastas" },
  { icon: Building2, label: "Organizações" },
  { icon: KeyRound, label: "Certificados" },
  { icon: ShieldCheck, label: "Validar documento" },
  { icon: FileStack, label: "Gerar documentos" },
];

const documents = [
  { title: "Proposta Comercial - Cliente ACME", folder: "Comercial", date: "03/10/2026 11:04" },
  { title: "Contrato de Prestação de Serviços", folder: "Jurídico", date: "02/10/2026 14:32" },
  { title: "Termo de Confidencialidade (NDA)", folder: "Jurídico", date: "01/10/2026 09:17" },
  { title: "Ordem de Serviço - Projeto Saúde", folder: "Operações", date: "30/09/2026 16:46" },
  {
    title: "Política Interna - Recursos Humanos",
    folder: "Recursos Humanos",
    date: "29/09/2026 10:02",
  },
];

export function ProductMockup({ label }: { label: string }) {
  return (
    <div
      className="relative mx-auto w-full max-w-[640px] select-none"
      role="img"
      aria-label={label}
    >
      {/* Notebook */}
      <div className="rounded-t-2xl border-[10px] border-b-0 border-neutral-900 bg-neutral-900 shadow-2xl">
        <div className="flex aspect-[16/10] overflow-hidden rounded-md bg-white text-[8px] sm:text-[10px]">
          <aside className="flex w-[28%] flex-col gap-1 bg-gradient-to-b from-brand-strong to-brand p-2 text-white sm:p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <img src={logoIcon} alt="" className="h-4 w-auto brightness-0 invert sm:h-5" />
              <span className="font-display text-[9px] font-bold sm:text-xs">MDSign</span>
            </div>
            {menu.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={
                  active
                    ? "flex items-center gap-1.5 rounded bg-white/20 px-1.5 py-1 font-semibold"
                    : "flex items-center gap-1.5 px-1.5 py-1 text-white/85"
                }
              >
                <Icon className="size-2.5 shrink-0 sm:size-3" aria-hidden />
                <span className="truncate">{label}</span>
              </div>
            ))}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b px-2 py-1.5 sm:px-3 sm:py-2">
              <span className="font-semibold">Documentos</span>
              <div className="flex items-center gap-2">
                <Search className="size-3 text-muted-foreground" aria-hidden />
                <span className="rounded bg-brand px-1.5 py-0.5 text-white">Roberta Rodrigues</span>
              </div>
            </div>
            <div className="flex gap-3 border-b px-2 pt-1.5 text-muted-foreground sm:px-3">
              <span className="border-b-2 border-brand-magenta pb-1 font-medium text-brand-magenta">
                Pendentes para mim (5)
              </span>
              <span className="pb-1">Concluídos (28)</span>
              <span className="hidden pb-1 sm:inline">Recusados (2)</span>
            </div>
            <ul className="flex-1 divide-y">
              {documents.map((doc) => (
                <li
                  key={doc.title}
                  className="flex items-center gap-2 px-2 py-[5px] sm:px-3 sm:py-2"
                >
                  <FileText className="size-3 shrink-0 text-brand-magenta sm:size-4" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{doc.title}</p>
                    <p className="truncate text-muted-foreground">{doc.folder}</p>
                  </div>
                  <span className="hidden shrink-0 text-muted-foreground sm:inline">
                    {doc.date}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="mx-[-6%] h-3 rounded-b-xl bg-gradient-to-b from-neutral-300 to-neutral-400 shadow-lg sm:h-4" />

      {/* Celular */}
      <div className="absolute -right-1 bottom-[-6%] w-[30%] rounded-[1.4rem] border-[6px] border-neutral-900 bg-white shadow-2xl sm:-right-4">
        <div className="flex aspect-[9/17] flex-col overflow-hidden rounded-[1rem] text-[7px] sm:text-[9px]">
          <div className="bg-brand px-2 py-2 text-center text-white">
            A assinatura já está posicionada no documento
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-2">
            <img src={logoIcon} alt="" className="h-8 w-auto sm:h-12" />
            <span className="font-display text-xs font-bold sm:text-base">MDSign</span>
          </div>
          <div className="p-2">
            <div className="rounded bg-brand py-1.5 text-center font-semibold text-white">
              Assinar
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
