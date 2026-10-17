// O tradutor do navegador (Google Tradutor do Chrome, extensões) troca nós de texto por <font>.
// Depois disso o React tenta remover ou inserir antes de um nó que já não está ali e a página
// inteira cai na tela de erro ("NotFoundError: insertBefore/removeChild"). Esta proteção ignora
// essas operações órfãs em vez de derrubar a tela (contorno conhecido: facebook/react#11538).
let installed = false;

export function installTranslateGuard() {
  if (installed || typeof Node === "undefined" || !Node.prototype) return;
  installed = true;
  const proto = Node.prototype as Node & Record<string, unknown>;
  const removeChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
  const insertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return insertBefore.call(this, node, null) as T;
    return insertBefore.call(this, node, ref) as T;
  };
}
