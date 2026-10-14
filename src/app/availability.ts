import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useOrgUsage } from "./components/plan-usage";

// Condições do Cedro: cada documento fica disponível para consulta e download por N meses
// (padrão 6) a partir da criação. A tela só mostra a data; quem bloqueia é o servidor.

let monthsCache: Promise<number | null> | null = null;

function cedroMonths() {
  monthsCache ??= Promise.resolve(
    supabase.rpc("cedro_availability_months").then(({ data }) => (data as number | null) ?? null),
  );
  return monthsCache;
}

/** Data até quando o documento fica disponível (null = sem prazo, plano pago). */
export function availableUntil(createdAt: string, months: number) {
  const d = new Date(createdAt);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Mesmo comportamento do Postgres para fim de mês (31/08 + 6 meses = 28/02).
  if (d.getDate() < day) d.setDate(0);
  return d;
}

export function useCedroAvailability() {
  const usage = useOrgUsage();
  const [months, setMonths] = useState<number | null>(null);
  const cedro = usage?.plan_id === "cedro";
  useEffect(() => {
    if (cedro) void cedroMonths().then(setMonths);
  }, [cedro]);
  return (createdAt: string) => {
    if (!cedro || !months) return null;
    const until = availableUntil(createdAt, months);
    return { until, expired: until.getTime() < Date.now() };
  };
}
