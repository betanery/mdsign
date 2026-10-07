import { useState } from "react";
import { toast } from "sonner";

import { callFunction } from "../api";
import { errorText } from "../errors";
import { useAppI18n } from "../i18n";
import { FormMessage } from "./auth-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Salvar a configuração de um lote como Processo MDSign ("Fazer de novo"). */
export function SaveProcessDialog({
  jobId,
  name: initial,
  onClose,
  onSaved,
}: {
  jobId: string;
  name: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useAppI18n();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await callFunction("bulk-jobs", { action: "save-process", jobId, name: name.trim() });
      toast.success(t.processes.saved);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.processes.save}</DialogTitle>
          <DialogDescription>{t.processes.subtitle}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void save(e)} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="proc-name">{t.processes.name}</Label>
            <Input
              id="proc-name"
              value={name}
              placeholder={t.processes.namePlaceholder}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={name.trim().length < 2}
              className="bg-brand hover:bg-brand-strong"
            >
              {t.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
