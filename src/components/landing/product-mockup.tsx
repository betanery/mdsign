import {
  Building2,
  CircleAlert,
  CircleCheck,
  FileStack,
  FileText,
  Folder,
  FolderClosed,
  Files,
  IdCard,
  Plus,
  RotateCcw,
  SearchCheck,
  UserRound,
} from "lucide-react";

import { logoIcon } from "./logo";

/**
 * Reprodução das telas reais do sistema (Documentos no computador e assinatura
 * no celular) com a marca MDSign e dados fictícios (PRD 2.2). Feita em HTML para
 * ficar nítida em qualquer tela e nunca exibir dados reais de clientes. O
 * conteúdo fica em português em todos os idiomas, como uma captura (PRD 27.5).
 */
const menu = [
  { icon: Files, label: "Documentos", active: true },
  { icon: FolderClosed, label: "Pastas" },
  { icon: Building2, label: "Organizações" },
  { icon: IdCard, label: "Certificados" },
  { icon: SearchCheck, label: "Validar documento" },
  { icon: FileStack, label: "Gerar documentos" },
];

const documents = [
  { title: "Proposta Comercial - Cliente ACME", folder: "Comercial", date: "03/10/2026 11:04" },
  { title: "Contrato de Prestação de Serviços", folder: "Jurídico", date: "02/10/2026 14:32" },
  { title: "Termo de Confidencialidade (NDA)", folder: "Jurídico", date: "01/10/2026 09:17" },
  { title: "Ordem de Serviço - Projeto Saúde", folder: "Operações", date: "30/09/2026 16:46" },
  { title: "Política Interna - Recursos Humanos", folder: "RH", date: "29/09/2026 10:02" },
];

/** Azul dos botões de ação do sistema ("Novo documento", "Assinar"). */
const actionBlue = "bg-[#0d4a96]";
/** Lilás da barra superior do sistema. */
const topBar = "bg-[#e3cfe8]";

export function ProductMockup({ label }: { label: string }) {
  return (
    <div
      className="relative mx-auto w-full max-w-[640px] select-none"
      role="img"
      aria-label={label}
    >
      {/* Notebook: tela Documentos */}
      <div className="rounded-t-2xl border-[10px] border-b-0 border-neutral-900 bg-neutral-900 shadow-2xl">
        <div className="flex aspect-[16/10] overflow-hidden rounded-md bg-[#f4f4f7] text-[7px] sm:text-[9px]">
          <aside className="flex w-[27%] flex-col gap-0.5 bg-brand-strong p-2 text-white sm:p-2.5">
            <div className="mb-2 flex items-center justify-center gap-1.5">
              <img
                src={logoIcon}
                alt=""
                width={102}
                height={112}
                className="h-4 w-auto brightness-0 invert sm:h-5"
              />
              <span className="font-display text-[9px] font-bold sm:text-xs">MDSign</span>
            </div>
            <div
              className={`${actionBlue} mb-1.5 flex items-center justify-center gap-1 rounded px-1 py-1 font-semibold shadow`}
            >
              <Plus className="size-2.5 shrink-0 sm:size-3" aria-hidden />
              <span className="truncate">Novo documento</span>
            </div>
            {menu.map(({ icon: Icon, label: item, active }) => (
              <div
                key={item}
                className={
                  active
                    ? "flex items-center gap-1.5 rounded bg-white/15 px-1.5 py-1 font-semibold"
                    : "flex items-center gap-1.5 px-1.5 py-1 text-white/90"
                }
              >
                <Icon className="size-2.5 shrink-0 sm:size-3" aria-hidden />
                <span className="truncate">{item}</span>
              </div>
            ))}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className={`${topBar} flex items-center justify-between px-2 py-1.5 shadow-sm sm:px-3 sm:py-2`}
            >
              <span className="font-semibold text-brand-strong sm:text-[11px]">Documentos</span>
              <div className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-white text-[6px] font-bold sm:size-5 sm:text-[8px]">
                  PT
                </span>
                <span className="flex items-center gap-1 rounded bg-brand-strong px-1.5 py-0.5 text-white">
                  <UserRound className="size-2.5" aria-hidden />
                  Marina Costa
                </span>
              </div>
            </div>
            <div className="mx-2 mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t bg-white shadow-sm sm:mx-3 sm:mt-2">
              <div className="flex items-center gap-3 border-b px-2 pt-1 text-muted-foreground">
                <span className="flex items-center gap-1 border-b-2 border-orange-500 pb-1 font-medium text-orange-500">
                  <CircleAlert className="size-2.5 fill-orange-500 text-white" aria-hidden />
                  Pendentes
                </span>
                <span className="flex items-center gap-1 pb-1">
                  <CircleCheck className="size-2.5" aria-hidden />
                  Concluídos
                </span>
                <span className="hidden items-center gap-1 pb-1 sm:flex">
                  <RotateCcw className="size-2.5" aria-hidden />
                  Recusados
                </span>
              </div>
              <ul className="flex-1 divide-y">
                {documents.map((doc) => (
                  <li key={doc.title} className="flex items-center gap-2 px-2 py-[4px] sm:py-1.5">
                    <span className="size-2 shrink-0 rounded-[2px] border border-neutral-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-neutral-800">{doc.title}</p>
                      <p className="flex items-center gap-2 truncate text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Building2 className="size-2" aria-hidden />
                          Empresa Exemplo
                        </span>
                        <span className="hidden items-center gap-0.5 sm:flex">
                          <Folder className="size-2 fill-current" aria-hidden />
                          {doc.folder}
                        </span>
                      </p>
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
      </div>
      <div className="mx-[-6%] h-3 rounded-b-xl bg-gradient-to-b from-neutral-300 to-neutral-400 shadow-lg sm:h-4" />

      {/* Celular: tela de assinatura */}
      <div className="absolute -right-1 bottom-[-6%] w-[30%] rounded-[1.4rem] border-[6px] border-neutral-900 bg-white shadow-2xl sm:-right-4">
        <div className="flex aspect-[9/17] flex-col overflow-hidden rounded-[1rem] bg-[#4a4a4a] text-[6px] sm:text-[8px]">
          <div className={`${topBar} px-2 py-1.5 font-semibold text-brand-strong`}>
            <span className="flex items-center gap-1 truncate">
              <FileText className="size-2.5 shrink-0" aria-hidden />
              Proposta Comercial
            </span>
          </div>
          <div className="mx-1.5 mt-1.5 rounded-t bg-brand-strong px-1.5 py-1 text-center leading-tight text-white">
            A assinatura já está posicionada no documento
          </div>
          <div className="mx-1.5 flex flex-1 flex-col items-center justify-center gap-1 bg-white p-1.5">
            <img src={logoIcon} alt="" width={102} height={112} className="h-6 w-auto sm:h-9" />
            <span className="font-display text-[8px] font-bold sm:text-xs">MDSign</span>
            <span className="mt-1 rounded-sm border border-dashed border-neutral-500 px-1 font-serif text-[6px] italic sm:text-[7px]">
              Carlos Pereira
            </span>
          </div>
          <div className="bg-white p-1.5">
            <div className={`${actionBlue} rounded py-1 text-center font-semibold text-white`}>
              Assinar
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
