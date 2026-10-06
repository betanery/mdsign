// Rascunho do editor de modelo PDF no navegador: se a página recarregar ou a pessoa sair
// antes de salvar, ela continua de onde parou. O PDF já está guardado no servidor
// (bucket privado); aqui fica só o caminho dele e a configuração feita até agora.
import type { TemplateRow } from "./components/template-fields";

const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export type TemplateDraft = {
  savedAt: number;
  step: number;
  row: Partial<TemplateRow>;
};

const key = (orgId: string, userId: string) => `mdsign:pdf-template-draft:${orgId}:${userId}`;

export function loadTemplateDraft(orgId: string, userId: string): TemplateDraft | null {
  try {
    const raw = localStorage.getItem(key(orgId, userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as TemplateDraft;
    if (!draft.row?.file_path || Date.now() - draft.savedAt > MAX_AGE) {
      localStorage.removeItem(key(orgId, userId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveTemplateDraft(
  orgId: string,
  userId: string,
  draft: Omit<TemplateDraft, "savedAt">,
) {
  try {
    localStorage.setItem(key(orgId, userId), JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Navegador sem armazenamento (janela anônima, bloqueio): segue sem rascunho.
  }
}

export function clearTemplateDraft(orgId: string, userId: string) {
  try {
    localStorage.removeItem(key(orgId, userId));
  } catch {
    // idem
  }
}
