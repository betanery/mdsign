import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { useAppI18n } from "../i18n";
import { loadSignerWidget } from "../signer-widget";

/**
 * Cerimônia de assinatura dentro do MDSign (PRD §32): renderiza o embedUrl no componente
 * oficial. `onSigned` avisa a tela; quem confirma o status é o backend (documents-action sync).
 */
export function SigningFrame({
  embedUrl,
  onSigned,
  onError,
}: {
  embedUrl: string;
  onSigned: () => void;
  onError: () => void;
}) {
  const { locale } = useAppI18n();
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const signed = useRef(onSigned);
  signed.current = onSigned;

  useEffect(() => {
    let cancelled = false;
    loadSignerWidget()
      .then((Widget) => {
        if (cancelled || !container.current) return;
        container.current.innerHTML = "";
        const widget = new Widget({ culture: locale, enableRefusal: true });
        widget.on(widget.events.documentSigned, () => signed.current());
        widget.on(widget.events.documentApproved, () => signed.current());
        widget.renderElement(embedUrl, container.current);
        setReady(true);
      })
      .catch(() => !cancelled && onError());
    return () => {
      cancelled = true;
    };
    // Recria só quando muda o documento ou o idioma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, locale]);

  return (
    <div className="relative min-h-[70svh] overflow-hidden rounded-2xl border bg-white shadow-sm">
      {!ready && (
        <div
          className="absolute inset-0 flex items-center justify-center text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </div>
      )}
      <div
        ref={container}
        className="h-[75svh] w-full [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
      />
    </div>
  );
}
