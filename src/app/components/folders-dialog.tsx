// Gerenciar pastas: criar, renomear e apagar (quem gerencia documentos). Apagar não apaga os
// documentos: eles ficam "sem pasta".

import { useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "../auth";
import { createFolder, deleteFolder, renameFolder, type Folder } from "../folders";
import { useAppI18n } from "../i18n";
import { useConfirm } from "./confirm-dialog";

export function FoldersDialog({
  orgId,
  folders,
  onClose,
  onChanged,
}: {
  orgId: string;
  folders: Folder[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, f } = useAppI18n();
  const { user } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (error: { code?: string } | null) =>
    toast.error(error?.code === "23505" ? t.folders.duplicate : t.common.genericError);

  async function add() {
    if (!user || !name.trim()) return;
    setBusy(true);
    const { error } = await createFolder(orgId, user.id, name);
    setBusy(false);
    if (error) return void fail(error);
    setName("");
    onChanged();
  }

  async function saveRename() {
    if (!editing?.name.trim()) return;
    setBusy(true);
    const { error } = await renameFolder(editing.id, editing.name);
    setBusy(false);
    if (error) return void fail(error);
    setEditing(null);
    onChanged();
  }

  async function remove(folder: Folder) {
    const ok = await confirm({
      title: t.folders.remove,
      text: f(t.folders.removeConfirm, { name: folder.name }),
      action: t.folders.remove,
    });
    if (!ok) return;
    const { error } = await deleteFolder(folder.id);
    if (error) return void fail(error);
    onChanged();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {confirmDialog}
        <DialogHeader>
          <DialogTitle>{t.folders.manage}</DialogTitle>
          <DialogDescription>{t.folders.manageHint}</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            aria-label={t.folders.newName}
            placeholder={t.folders.newName}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            className="shrink-0 bg-brand hover:bg-brand-strong"
            disabled={busy || !name.trim()}
          >
            {busy && !editing && <Loader2 className="animate-spin" aria-hidden />}
            {t.folders.create}
          </Button>
        </form>
        {folders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.folders.empty}</p>
        ) : (
          <ul className="grid gap-1">
            {folders.map((fo) => (
              <li key={fo.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                {editing?.id === fo.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveRename();
                    }}
                  >
                    <Input
                      aria-label={t.folders.rename}
                      value={editing.name}
                      maxLength={80}
                      autoFocus
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                    <Button type="submit" size="sm" disabled={busy}>
                      {t.folders.save}
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{fo.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${t.folders.rename}: ${fo.name}`}
                      onClick={() => setEditing({ id: fo.id, name: fo.name })}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label={`${t.folders.remove}: ${fo.name}`}
                      onClick={() => void remove(fo)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
