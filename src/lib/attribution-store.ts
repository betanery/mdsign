// Chaves da origem do visitante (campanha), compartilhadas entre a captura (analytics.ts) e as
// preferências de cookies (consent.ts), sem um importar o outro.
//
// - sessionStorage: sempre, só enquanto a aba estiver aberta (sem cookie, sem consentimento).
// - localStorage: só com consentimento de cookies de análise, por ATTRIBUTION_DAYS; recusar ou
//   retirar o consentimento apaga.

export const ATTR_KEY = "mdsign_attr";
export const LAST_KEY = "mdsign_attr_last";
export const SAVED_KEY = "mdsign_attr_saved";
export const ATTRIBUTION_DAYS = 30;

/** Copia a origem da aba para o navegador (com consentimento) ou apaga a cópia (sem). */
export function syncSavedAttribution(analyticsConsent: boolean) {
  try {
    if (!analyticsConsent) {
      localStorage.removeItem(SAVED_KEY);
      return;
    }
    const first = JSON.parse(sessionStorage.getItem(ATTR_KEY) ?? "null");
    const last = JSON.parse(sessionStorage.getItem(LAST_KEY) ?? "null");
    if (!first && !last) return;
    localStorage.setItem(
      SAVED_KEY,
      JSON.stringify({ first, last, exp: Date.now() + ATTRIBUTION_DAYS * 86400000 }),
    );
  } catch {
    // armazenamento indisponível
  }
}
