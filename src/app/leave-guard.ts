import { useBlocker } from "@tanstack/react-router";

import { useAppI18n } from "./i18n";

/**
 * Pergunta antes de sair de um fluxo pela metade (menu, voltar do navegador, fechar a aba).
 * Sem isso, um clique no menu apagava tudo o que já tinha sido preenchido.
 */
export function useLeaveGuard(active: boolean) {
  const { t } = useAppI18n();
  useBlocker({
    shouldBlockFn: () => active && !window.confirm(t.common.leaveConfirm),
    enableBeforeUnload: () => active,
  });
}
