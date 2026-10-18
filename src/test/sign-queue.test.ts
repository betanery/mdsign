import { describe, expect, it } from "vitest";

import { pendingQueue } from "@/app/documents";

type D = { id: string; role?: "signer" | "approver" | "witness" };

describe("Assinar todos", () => {
  it("só o que espera por mim, assinaturas antes de aprovações, na ordem da lista", () => {
    const docs: D[] = [
      { id: "a", role: "approver" },
      { id: "b", role: "signer" },
      { id: "c" },
      { id: "d", role: "witness" },
      { id: "e", role: "approver" },
    ];
    const q = pendingQueue(docs, (d) => (d.role ? { role: d.role } : undefined));
    expect(q.map((d) => d.id)).toEqual(["b", "d", "a", "e"]);
  });

  it("sem pendências, fila vazia", () => {
    expect(pendingQueue([{ id: "x" }] as D[], () => undefined)).toEqual([]);
  });
});
