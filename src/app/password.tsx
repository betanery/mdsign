import { useId, useState } from "react";
import { Check, Circle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PasswordInput } from "./components/password-input";
import { useAppI18n } from "./i18n";

/** Política de senha do MDSign: mínimo 8 caracteres, 1 número e 1 caractere especial. */
export const PASSWORD_MIN_LENGTH = 8;

export function passwordChecks(password: string, confirm: string) {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    number: /\d/.test(password),
    // Qualquer caractere que não seja letra, número ou espaço (inclui ! @ # $ % _ - etc.).
    special: /[^\p{L}\p{N}\s]/u.test(password),
    match: password.length > 0 && password === confirm,
  };
}

export function isStrongPassword(password: string): boolean {
  const c = passwordChecks(password, password);
  return c.length && c.number && c.special;
}

/**
 * Campos "Senha" + "Confirmar senha" com a lista de requisitos atualizada enquanto a
 * pessoa digita. Use `validatePassword` no envio do formulário.
 */
export function PasswordFields({
  label,
  autoFocus,
}: {
  /** Rótulo do primeiro campo (ex.: "Senha" ou "Nova senha"). */
  label: string;
  autoFocus?: boolean;
}) {
  const { t } = useAppI18n();
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const checks = passwordChecks(password, confirm);
  const rules = [
    { ok: checks.length, text: t.auth.ruleLength },
    { ok: checks.number, text: t.auth.ruleNumber },
    { ok: checks.special, text: t.auth.ruleSpecial },
    { ok: checks.match, text: t.auth.ruleMatch },
  ];

  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-password`}>{label}</Label>
        <PasswordInput
          id={`${id}-password`}
          name="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={`${id}-rules`}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-confirm`}>{t.auth.confirmPassword}</Label>
        <PasswordInput
          id={`${id}-confirm`}
          name="passwordConfirm"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-describedby={`${id}-rules`}
        />
      </div>
      <div id={`${id}-rules`} className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
        <p className="mb-1 font-medium text-foreground">{t.auth.passwordRulesTitle}</p>
        <ul className="grid gap-0.5">
          {rules.map((r) => (
            <li
              key={r.text}
              className={cn(
                "flex items-center gap-1.5",
                r.ok ? "text-success" : "text-muted-foreground",
              )}
            >
              {r.ok ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Circle className="size-3.5" aria-hidden />
              )}
              <span>
                {r.text}
                <span className="sr-only">{r.ok ? " ✓" : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** Valida senha e confirmação vindas do formulário. Devolve a mensagem de erro ou null. */
export function validatePassword(
  form: FormData,
  t: { auth: { passwordMismatch: string; passwordWeakRules: string } },
): string | null {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("passwordConfirm") ?? "");
  if (!isStrongPassword(password)) return t.auth.passwordWeakRules;
  if (password !== confirm) return t.auth.passwordMismatch;
  return null;
}
