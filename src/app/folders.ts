// Pastas de documentos (só no MDSign): listar, criar, renomear, apagar e mover documentos.
// As regras ficam no banco (RLS e move_documents); a tela só chama.

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export type Folder = { id: string; name: string };

export function useFolders(orgId: string | undefined) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const reload = useCallback(async () => {
    if (!orgId) return setFolders([]);
    const { data } = await supabase
      .from("document_folders")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name");
    setFolders((data as Folder[] | null) ?? []);
  }, [orgId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { folders, reload };
}

export async function createFolder(orgId: string, userId: string, name: string) {
  return supabase
    .from("document_folders")
    .insert({ organization_id: orgId, name: name.trim(), created_by: userId })
    .select("id, name")
    .single();
}

export const renameFolder = (id: string, name: string) =>
  supabase.from("document_folders").update({ name: name.trim() }).eq("id", id);

export const deleteFolder = (id: string) => supabase.from("document_folders").delete().eq("id", id);

/** Move documentos (null = sem pasta). Devolve quantos o banco aceitou mover. */
export async function moveDocuments(orgId: string, ids: string[], folder: string | null) {
  const { data, error } = await supabase.rpc("move_documents", { org: orgId, ids, folder });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/** Contagem por pasta a partir da lista carregada ("none" = sem pasta). */
export function folderCounts(docs: { folder_id?: string | null }[]) {
  const out: Record<string, number> = {};
  for (const d of docs) {
    const k = d.folder_id ?? "none";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
