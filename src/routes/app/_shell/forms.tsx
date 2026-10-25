import { useCallback, useEffect, useMemo, useState } from "react";
import { FeatureGate } from "@/app/components/feature-preview";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, ExternalLink, Link2, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { needsPhone, useAppConfig, type AuthLevel } from "@/app/app-config";
import { useAuth } from "@/app/auth";
import { PageHeader, SectionTabs } from "@/app/components/app-shell";
import { FormMessage } from "@/app/components/auth-layout";
import {
  FieldInput,
  fillableFields,
  templateSelect,
  validateValues,
  type TemplateRow,
} from "@/app/components/template-fields";
import {
  newParticipant,
  ParticipantsEditor,
  toPayload,
  validateParticipants,
  type ParticipantDraft,
} from "@/app/components/participants-editor";
import { useConfirm } from "@/app/components/confirm-dialog";
import { useAppI18n } from "@/app/i18n";
import { useOrg } from "@/app/org";
import { selectClass } from "@/app/ui";
import { friendlyError } from "@/app/validation";
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
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Formulários / links públicos (PRD §14).
export const Route = createFileRoute("/app/_shell/forms")({
  // Recurso do plano: fora dele, a prévia de upgrade no lugar da tela (o backend recusa).
  component: () => (
    <FeatureGate code="forms">
      <FormsPage />
    </FeatureGate>
  ),
});

type FormRow = {
  id: string;
  token: string;
  name: string;
  active: boolean;
  expires_at: string | null;
  max_responses: number | null;
  responses_count: number;
  created_at: string;
  template_id: string;
  templates: { name: string } | null;
};

const linkFor = (token: string) => `${window.location.origin}/f/${token}`;

function FormsPage() {
  const { t, f, locale } = useAppI18n();
  const [confirm, confirmDialog] = useConfirm();
  const { current, can } = useOrg();
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!current) return;
    const { data } = await supabase
      .from("forms")
      .select(
        "id, token, name, active, expires_at, max_responses, responses_count, created_at, template_id, templates (name)",
      )
      .eq("organization_id", current.id)
      .order("created_at", { ascending: false });
    setForms((data as unknown as FormRow[] | null) ?? []);
  }, [current]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      toast.success(t.common.copied);
    } catch {
      toast.error(t.common.genericError);
    }
  }

  async function toggle(form: FormRow) {
    const { error } = await supabase
      .from("forms")
      .update({ active: !form.active })
      .eq("id", form.id);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    void load();
  }

  async function remove(form: FormRow) {
    const ok = await confirm({
      title: t.common.remove,
      text: f(t.forms.removeConfirm, { name: form.name }),
      action: t.common.remove,
    });
    if (!ok) return;
    const { error } = await supabase.from("forms").delete().eq("id", form.id);
    if (error) {
      toast.error(friendlyError(error, t));
      return;
    }
    void load();
  }

  if (!current) return <p>{t.notFoundOrg}</p>;
  if (!can("templates.manage")) return <p>{t.common.forbidden}</p>;
  const fmt = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, { dateStyle: "short" });

  return (
    <>
      <PageHeader
        title={t.forms.title}
        subtitle={t.forms.subtitle}
        actions={
          <Button className="bg-brand hover:bg-brand-strong" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {t.forms.new}
          </Button>
        }
      />
      <SectionTabs
        tabs={[
          { to: "/app/templates", label: t.sections.templates },
          { to: "/app/forms", label: t.sections.forms },
        ]}
      />
      {forms === null ? (
        <p className="text-muted-foreground">{t.common.loading}</p>
      ) : forms.length === 0 ? (
        <p className="rounded-2xl border bg-white p-5 text-muted-foreground">{t.forms.empty}</p>
      ) : (
        <ul className="grid gap-3">
          {forms.map((form) => {
            const expired = form.expires_at && new Date(form.expires_at) < new Date();
            const full = form.max_responses != null && form.responses_count >= form.max_responses;
            const state = !form.active
              ? t.forms.inactive
              : expired
                ? t.forms.expired
                : full
                  ? t.forms.full
                  : t.forms.active;
            const live = form.active && !expired && !full;
            return (
              <li
                key={form.id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm"
              >
                <Link2 className="size-5 shrink-0 text-brand" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{form.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {form.templates?.name && form.templates.name !== form.name
                      ? `${form.templates.name} · `
                      : ""}
                    {f(t.forms.createdOn, { date: fmt.format(new Date(form.created_at)) })} ·{" "}
                    {form.max_responses
                      ? f(t.forms.responsesMax, {
                          n: String(form.responses_count),
                          max: String(form.max_responses),
                        })
                      : form.responses_count === 1
                        ? t.forms.responsesOne
                        : f(t.forms.responses, { n: String(form.responses_count) })}
                    {form.expires_at &&
                      ` · ${t.forms.expiresAt} ${fmt.format(new Date(form.expires_at))}`}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    live ? "bg-success/15 text-green-800" : "bg-muted text-muted-foreground",
                  )}
                >
                  {state}
                </span>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => void copy(form.token)}>
                    <Copy aria-hidden />
                    {t.forms.copyLink}
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={linkFor(form.token)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden />
                      {t.forms.open}
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void toggle(form)}>
                    <Power aria-hidden />
                    {form.active ? t.forms.deactivate : t.forms.activate}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(form)}
                    aria-label={`${t.common.remove} ${form.name}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {creating && (
        <CreateFormDialog
          onClose={() => setCreating(false)}
          onCreated={(token) => {
            setCreating(false);
            void load();
            void copy(token);
            toast.success(t.forms.created);
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}

function CreateFormDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (token: string) => void;
}) {
  const { t } = useAppI18n();
  const { user } = useAuth();
  const { current } = useOrg();
  const config = useAppConfig();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [expiresAt, setExpiresAt] = useState("");
  const [maxResponses, setMaxResponses] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [authLevel, setAuthLevel] = useState<AuthLevel>("basic");
  const [bad, setBad] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!current) return;
    supabase
      .from("templates")
      .select(templateSelect)
      .or(`scope.eq.mdsign,organization_id.eq.${current.id}`)
      .neq("scope", "personal")
      .order("name")
      .then(({ data }) => setTemplates((data as TemplateRow[] | null) ?? []));
  }, [current]);

  const tpl = useMemo(() => templates.find((x) => x.id === templateId), [templates, templateId]);
  // Modelo com papéis: quem responde ocupa o 1º; os demais são pessoas fixas.
  const roles = useMemo(
    () => [...(tpl?.participants ?? [])].sort((a, b) => a.slot - b.slot),
    [tpl],
  );
  const otherRoles = roles.slice(1);
  const [people, setPeople] = useState<ParticipantDraft[]>([]);
  const [peopleProblems, setPeopleProblems] = useState<Record<number, string[]>>({});
  useEffect(() => {
    setPeople(
      otherRoles.map((r) => ({ ...newParticipant(), role: r.role, authLevel: r.authLevel })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !tpl) return;
    setError(null);
    const filled = Object.fromEntries(Object.entries(fixed).filter(([, v]) => v.trim()));
    // Só confere o formato do que foi preenchido aqui; o resto quem responde preenche.
    const invalid = validateValues(
      tpl.fields.filter((fl) => fl.key in filled).map((fl) => ({ ...fl, required: false })),
      filled,
    );
    setBad(invalid);
    if (invalid.length) return setError(t.errors["invalid_fields"]!);
    if (redirectUrl && !/^https:\/\//.test(redirectUrl)) return setError(t.forms.redirectInvalid);
    const pp = validateParticipants(people, config);
    setPeopleProblems(pp);
    if (Object.keys(pp).length) return setError(t.errors["invalid_participants"]!);
    setBusy(true);
    const { data, error: err } = await supabase
      .from("forms")
      .insert({
        organization_id: current.id,
        template_id: tpl.id,
        created_by: user?.id ?? null,
        name: name.trim() || tpl.name,
        fixed_values: filled,
        role_people: Object.fromEntries(
          toPayload(people).map((p, i) => [String(otherRoles[i]!.slot), p]),
        ),
        expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
        max_responses: maxResponses ? Math.max(1, Number(maxResponses)) : null,
        redirect_url: redirectUrl.trim() || null,
        auth_level: authLevel,
      })
      .select("token")
      .single();
    setBusy(false);
    if (err || !data) return setError(friendlyError(err, t));
    onCreated(data.token as string);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.forms.new}</DialogTitle>
          <DialogDescription>{t.forms.subtitle}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void create(e)} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="form-template">{t.forms.template}</Label>
            <select
              id="form-template"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setFixed({});
                const chosen = templates.find((x) => x.id === e.target.value);
                if (chosen && !name) setName(chosen.name);
              }}
              className={`${selectClass} h-10`}
              required
            >
              <option value="">{t.forms.chooseTemplate}</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="form-name">{t.forms.name}</Label>
            <Input
              id="form-name"
              value={name}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {otherRoles.length > 0 && (
            <fieldset className="grid gap-3 rounded-xl border p-3">
              <legend className="px-1 font-medium">{t.pdf.otherRoles}</legend>
              <p className="text-xs text-muted-foreground">
                {t.pdf.otherRolesHint.replace("{role}", roles[0]!.label)}
              </p>
              <ParticipantsEditor
                labels={otherRoles.map((r) => r.label)}
                value={people}
                onChange={setPeople}
                config={config}
                problems={peopleProblems}
              />
            </fieldset>
          )}
          {tpl && tpl.fields.length > 0 && (
            <fieldset className="grid gap-3 rounded-xl border p-3">
              <legend className="px-1 font-medium">{t.forms.fixedValues}</legend>
              <p className="text-xs text-muted-foreground">{t.forms.fixedHint}</p>
              {fillableFields(tpl.fields)
                .filter((fl) => fl.source !== "signer")
                .map((fl) => (
                  <FieldInput
                    key={fl.key}
                    field={{ ...fl, required: false }}
                    value={fixed[fl.key] ?? ""}
                    onChange={(v) => setFixed((s) => ({ ...s, [fl.key]: v }))}
                    invalid={bad.includes(fl.key)}
                    t={t}
                    idPrefix="fixed"
                  />
                ))}
            </fieldset>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="form-expires">{t.forms.expiresAt}</Label>
              <Input
                id="form-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="form-max">{t.forms.maxResponses}</Label>
              <Input
                id="form-max"
                type="number"
                min={1}
                placeholder={t.forms.unlimited}
                value={maxResponses}
                onChange={(e) => setMaxResponses(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="form-auth">{t.forms.authLevel}</Label>
            <select
              id="form-auth"
              value={authLevel}
              onChange={(e) => setAuthLevel(e.target.value as AuthLevel)}
              className={`${selectClass} h-10`}
            >
              {config.authLevels
                .filter((l) => !needsPhone(l))
                .map((l) => (
                  <option key={l} value={l}>
                    {t.participants.levels[l]}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="form-redirect">{t.forms.redirectUrl}</Label>
            <Input
              id="form-redirect"
              type="url"
              placeholder="https://"
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
            />
          </div>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={busy || !tpl}
              className="bg-brand hover:bg-brand-strong"
            >
              {t.forms.create}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
