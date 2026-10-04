/**
 * Componente oficial de assinatura embutida da Lacuna (LacunaSignerWidget 0.8.0).
 * Carregado do CDN da Lacuna com verificação de integridade (SRI), uma única vez.
 * Os eventos do componente são só um aviso: o status real é confirmado no backend.
 */

const SRC = "https://cdn.lacunasoftware.com/libs/signer/lacuna-signer-widget-0.8.0.min.js";
const INTEGRITY = "sha256-kS96fv3kyz1iJOP3crrI/2dvBzAgEHu4dZF9ecS/f0I=";

type WidgetEvent = { id: string; type: string };
export type SignerWidget = {
  events: { documentSigned: string; documentApproved: string };
  on: (event: string, handler: (e: WidgetEvent) => void) => void;
  renderElement: (embedUrl: string, element: HTMLElement, page?: string, scale?: string) => void;
};
type WidgetConstructor = new (options?: Record<string, unknown>) => SignerWidget;

declare global {
  interface Window {
    LacunaSignerWidget?: WidgetConstructor;
  }
}

let loading: Promise<WidgetConstructor> | null = null;

export function loadSignerWidget(): Promise<WidgetConstructor> {
  if (window.LacunaSignerWidget) return Promise.resolve(window.LacunaSignerWidget);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SRC;
    script.integrity = INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () =>
      window.LacunaSignerWidget
        ? resolve(window.LacunaSignerWidget)
        : reject(new Error("widget_missing"));
    script.onerror = () => {
      loading = null;
      reject(new Error("widget_load_failed"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
