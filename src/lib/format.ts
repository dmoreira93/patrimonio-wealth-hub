export const MONTHS_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export const MONTHS_FULL = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function brl(value: number | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function compactBrl(value: number | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "R$ 0";
  const abs = Math.abs(num);
  if (abs >= 1_000_000) {
    return `R$ ${(num / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  }
  if (abs >= 1_000) {
    return `R$ ${(num / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return brl(num);
}

export function pct(value: number | null | undefined, digits = 2): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0,00%";
  return `${num.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function currentMonthIso(): string {
  return todayIso().slice(0, 7);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function monthLabel(ym: string): string {
  if (!ym) return "—";
  const [y, m] = ym.slice(0, 7).split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}

export function monthFullLabel(ym: string): string {
  if (!ym) return "—";
  const [y, m] = ym.slice(0, 7).split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTHS_FULL[m - 1]} de ${y}`;
}

export function addMonthsIso(ymOrIso: string, offset: number): string {
  const [y, m] = ymOrIso.slice(0, 7).split("-").map(Number);
  const total = (y || 2026) * 12 + ((m || 1) - 1) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function daysBetween(startIso: string | null | undefined, endIso: string | null | undefined): number {
  if (!startIso || !endIso) return 0;
  const [sy, sm, sd] = startIso.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endIso.slice(0, 10).split("-").map(Number);
  if (!sy || !ey) return 0;
  const s = new Date(sy, (sm || 1) - 1, sd || 1);
  const e = new Date(ey, (em || 1) - 1, ed || 1);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
}

export function monthsBetweenIso(fromYm: string, toYm: string): number {
  const [fy, fm] = fromYm.slice(0, 7).split("-").map(Number);
  const [ty, tm] = toYm.slice(0, 7).split("-").map(Number);
  if (!fy || !ty) return 0;
  return (ty - fy) * 12 + ((tm || 1) - (fm || 1));
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
