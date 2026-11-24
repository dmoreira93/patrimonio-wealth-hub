import React, { useMemo, useState } from "react";
import {
  Building,
  CheckCircle2,
  Plus,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useWealth } from "../contexts/WealthContext";
import {
  brl,
  currentMonthIso,
  formatDate,
  pct,
  todayIso,
} from "../lib/format";
import {
  calculateCorrectedDeposit,
  calculateRentalFciMonthly,
  SAVINGS_MONTHLY_RATE,
} from "../lib/finance-engine";
import { Badge, EmptyState, Modal, Panel, ProgressBar, SectionHeader, StatCard } from "./ui/WealthUI";
import type { FinancialGoal, RentalContract } from "../types/wealth";

export function RentalsGoalsView({ initialMode = "alugueis" }: { initialMode?: "alugueis" | "metas" }) {
  const {
    state,
    upsertRental,
    removeRental,
    registerRentalMonth,
    renewRentalContract,
    upsertGoal,
    removeGoal,
    contributeToGoal,
  } = useWealth();

  const [tab, setTab] = useState<"alugueis" | "metas">(initialMode);
  const [showNewRentalModal, setShowNewRentalModal] = useState(false);
  const [showNewGoalModal, setShowNewGoalModal] = useState(false);

  const [rentalForm, setRentalForm] = useState({
    propertyName: "",
    role: "landlord" as "landlord" | "tenant",
    counterpart: "",
    monthlyAmount: "",
    dueDay: "6",
    startDate: todayIso(),
    endDate: "",
    adjustmentIndex: "IGP-M" as "IGP-M" | "IPCA" | "Fixo",
    adjustMonth: "7",
    depositAmount: "",
    depositDate: todayIso(),
    fciPercent: "6",
  });

  const [goalForm, setGoalForm] = useState({
    name: "",
    category: "Emergência" as FinancialGoal["category"],
    targetAmount: "",
    currentAmount: "",
    targetDate: "",
    monthlyContributionPlan: "",
  });

  const rentalMetrics = useMemo(() => {
    const active = state.rentals.filter((r) => r.status === "active");
    const rec = active
      .filter((r) => r.role === "landlord")
      .reduce((s, r) => s + Number(r.monthlyAmount), 0);
    const pay = active
      .filter((r) => r.role === "tenant")
      .reduce((s, r) => s + Number(r.monthlyAmount) + calculateRentalFciMonthly(r), 0);
    const fciTotal = state.rentalFciEntries.reduce((s, e) => s + Number(e.amount), 0);
    const depositTotal = active.reduce(
      (s, r) => s + calculateCorrectedDeposit(r.depositAmount, r.depositDate),
      0,
    );
    return { rec, pay, fciTotal, depositTotal };
  }, [state.rentals, state.rentalFciEntries]);

  const handleCreateRental = (e: React.FormEvent) => {
    e.preventDefault();
    const monthly = Number(rentalForm.monthlyAmount.replace(",", "."));
    if (!rentalForm.propertyName.trim() || !Number.isFinite(monthly) || monthly <= 0) {
      toast.error("Informe o nome do imóvel e o valor mensal.");
      return;
    }
    upsertRental({
      propertyName: rentalForm.propertyName.trim(),
      role: rentalForm.role,
      counterpart: rentalForm.counterpart.trim() || "Inquilino / Proprietário",
      monthlyAmount: monthly,
      dueDay: Number(rentalForm.dueDay) || 5,
      startDate: rentalForm.startDate,
      endDate: rentalForm.endDate || undefined,
      adjustmentIndex: rentalForm.adjustmentIndex,
      adjustMonth: Number(rentalForm.adjustMonth) || 7,
      depositAmount: Number(rentalForm.depositAmount.replace(",", ".")) || 0,
      depositDate: rentalForm.depositDate || undefined,
      fciPercent: Number(rentalForm.fciPercent.replace(",", ".")) || 0,
    });
    toast.success("Contrato de aluguel salvo!");
    setShowNewRentalModal(false);
    setRentalForm((p) => ({ ...p, propertyName: "", counterpart: "", monthlyAmount: "" }));
  };

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(goalForm.targetAmount.replace(",", "."));
    const current = Number(goalForm.currentAmount.replace(",", ".")) || 0;
    if (!goalForm.name.trim() || !Number.isFinite(target) || target <= 0) {
      toast.error("Informe o nome e o valor alvo da meta.");
      return;
    }
    upsertGoal({
      name: goalForm.name.trim(),
      category: goalForm.category,
      targetAmount: target,
      currentAmount: current,
      targetDate: goalForm.targetDate || undefined,
      monthlyContributionPlan:
        Number(goalForm.monthlyContributionPlan.replace(",", ".")) || undefined,
    });
    toast.success("Meta financeira criada!");
    setShowNewGoalModal(false);
    setGoalForm({
      name: "",
      category: "Emergência",
      targetAmount: "",
      currentAmount: "",
      targetDate: "",
      monthlyContributionPlan: "",
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Imóveis, Locações & Objetivos Patrimoniais"
        title={
          tab === "alugueis"
            ? "Gestão de Aluguéis (FCI, Caução & IGP-M)"
            : "Metas & Objetivos Financeiros"
        }
        subtitle={
          tab === "alugueis"
            ? "Controle contratos como locador ou locatário, Fundo de Conservação (FCI) e caução corrigida pela poupança"
            : "Acompanhe o progresso da sua Reserva de Emergência, Independência Financeira e projetos pessoais"
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("alugueis")}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                tab === "alugueis"
                  ? "bg-amber-500 text-slate-950"
                  : "border border-slate-800 bg-slate-900 text-slate-300"
              }`}
            >
              Contratos de Aluguel
            </button>
            <button
              onClick={() => setTab("metas")}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                tab === "metas"
                  ? "bg-amber-500 text-slate-950"
                  : "border border-slate-800 bg-slate-900 text-slate-300"
              }`}
            >
              Metas Financeiras
            </button>
          </div>
        }
      />

      {tab === "alugueis" ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Receita de Aluguel / Mês"
              value={brl(rentalMetrics.rec)}
              tone="positive"
            />
            <StatCard
              label="Despesa de Aluguel / Mês"
              value={brl(rentalMetrics.pay)}
              tone="negative"
            />
            <StatCard
              label="FCI Acumulado (Caixinha)"
              value={brl(rentalMetrics.fciTotal)}
              tone="sky"
              hint={`${state.rentalFciEntries.length} competências recolhidas`}
            />
            <StatCard
              label="Caução Corrigida (Poupança)"
              value={brl(rentalMetrics.depositTotal)}
              tone="gold"
              hint={`Correção ~${(SAVINGS_MONTHLY_RATE * 100).toFixed(2)}% a.m.`}
            />
          </div>

          <Panel
            title="Contratos de Locação"
            actions={
              <button
                onClick={() => setShowNewRentalModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                <Plus className="size-3.5" />
                Novo Contrato
              </button>
            }
          >
            {state.rentals.length === 0 ? (
              <EmptyState title="Nenhum contrato de aluguel cadastrado" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {state.rentals.map((r) => {
                  const fciMonthly = calculateRentalFciMonthly(r);
                  const correctedDeposit = calculateCorrectedDeposit(
                    r.depositAmount,
                    r.depositDate,
                  );
                  const fciAccum = state.rentalFciEntries
                    .filter((e) => e.rentalId === r.id)
                    .reduce((s, e) => s + Number(e.amount), 0);

                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/75 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <Building className="size-4 text-amber-400" />
                            <h3 className="font-bold text-slate-100">{r.propertyName}</h3>
                            <Badge tone={r.role === "landlord" ? "positive" : "negative"}>
                              {r.role === "landlord" ? "Recebo (Locador)" : "Pago (Locatário)"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            Contraparte: {r.counterpart} · Vence dia {r.dueDay} · Índice{" "}
                            {r.adjustmentIndex}
                          </p>
                        </div>
                        <button
                          onClick={() => removeRental(r.id)}
                          className="rounded p-1 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-800/80 bg-slate-900/70 p-3 text-xs">
                        <div>
                          <span className="text-[10px] uppercase text-slate-400">
                            Aluguel Mensal
                          </span>
                          <p className="font-mono text-sm font-bold text-slate-100 tabular-nums">
                            {brl(r.monthlyAmount)}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-400">
                            FCI ({r.fciPercent}%)
                          </span>
                          <p className="font-mono text-sm font-semibold text-sky-400 tabular-nums">
                            {brl(fciMonthly)}/mês
                          </p>
                          <p className="text-[10px] text-slate-400">Acum: {brl(fciAccum)}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-400">
                            Caução Corrigida
                          </span>
                          <p className="font-mono text-sm font-semibold text-amber-400 tabular-nums">
                            {brl(correctedDeposit)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => registerRentalMonth(r.id, currentMonthIso())}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                        >
                          <CheckCircle2 className="size-3.5" />
                          Lançar Aluguel deste Mês
                        </button>
                        <button
                          onClick={() => {
                            const suggested = (
                              r.monthlyAmount *
                              (1 + state.settings.igpmAnnual / 100)
                            ).toFixed(2);
                            const nextVal = window.prompt(
                              `Novo valor após reajuste (${r.adjustmentIndex} ${state.settings.igpmAnnual}% sugere R$ ${suggested}):`,
                              suggested,
                            );
                            if (!nextVal) return;
                            const num = Number(nextVal.replace(",", "."));
                            if (Number.isFinite(num) && num > 0) {
                              renewRentalContract(r.id, num, todayIso());
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                        >
                          <RefreshCw className="size-3.5" />
                          Aplicar Reajuste Anual
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      ) : (
        <div className="space-y-6">
          <Panel
            title="Minhas Metas Patrimoniais"
            subtitle="Acompanhe reservas, viagens e objetivos de longo prazo"
            actions={
              <button
                onClick={() => setShowNewGoalModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                <Plus className="size-3.5" />
                Nova Meta
              </button>
            }
          >
            <div className="grid gap-4 md:grid-cols-3">
              {state.goals.map((g) => {
                const progress = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
                return (
                  <div
                    key={g.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/75 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Badge tone="gold">{g.category}</Badge>
                        <h3 className="mt-1.5 font-bold text-slate-100">{g.name}</h3>
                      </div>
                      <button
                        onClick={() => removeGoal(g.id)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex items-baseline justify-between">
                      <span className="font-mono text-lg font-bold text-amber-400 tabular-nums">
                        {brl(g.currentAmount)}
                      </span>
                      <span className="font-mono text-xs text-slate-400 tabular-nums">
                        de {brl(g.targetAmount)} ({pct(progress, 0)})
                      </span>
                    </div>

                    <div className="mt-2">
                      <ProgressBar pct={progress} tone="gold" height="h-2" />
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        {g.targetDate ? `Alvo: ${formatDate(g.targetDate)}` : "Sem prazo fixo"}
                      </span>
                      <button
                        onClick={() => {
                          const raw = window.prompt("Valor do aporte na meta (R$):", "1000");
                          if (!raw) return;
                          const val = Number(raw.replace(",", "."));
                          if (Number.isFinite(val) && val > 0) contributeToGoal(g.id, val);
                        }}
                        className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/25"
                      >
                        + Registrar Aporte
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}

      {/* Modal Novo Aluguel */}
      <Modal
        open={showNewRentalModal}
        onClose={() => setShowNewRentalModal(false)}
        title="Novo Contrato de Locação"
      >
        <form onSubmit={handleCreateRental} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Imóvel</label>
            <input
              type="text"
              placeholder="Ex.: Apartamento Jardins / Studio Pinheiros"
              value={rentalForm.propertyName}
              onChange={(e) => setRentalForm({ ...rentalForm, propertyName: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Posição</label>
              <select
                value={rentalForm.role}
                onChange={(e) =>
                  setRentalForm({
                    ...rentalForm,
                    role: e.target.value as "landlord" | "tenant",
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="landlord">Recebo (Locador)</option>
                <option value="tenant">Pago (Locatário)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Contraparte</label>
              <input
                type="text"
                value={rentalForm.counterpart}
                onChange={(e) => setRentalForm({ ...rentalForm, counterpart: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Aluguel Mensal (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={rentalForm.monthlyAmount}
                onChange={(e) => setRentalForm({ ...rentalForm, monthlyAmount: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">FCI (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={rentalForm.fciPercent}
                onChange={(e) => setRentalForm({ ...rentalForm, fciPercent: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Caução (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={rentalForm.depositAmount}
                onChange={(e) => setRentalForm({ ...rentalForm, depositAmount: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewRentalModal(false)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950"
            >
              Salvar Contrato
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Nova Meta */}
      <Modal
        open={showNewGoalModal}
        onClose={() => setShowNewGoalModal(false)}
        title="Criar Nova Meta Financeira"
      >
        <form onSubmit={handleCreateGoal} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Nome da Meta</label>
            <input
              type="text"
              placeholder="Ex.: Reserva de Emergência, Troca de Carro..."
              value={goalForm.name}
              onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Valor Alvo (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={goalForm.targetAmount}
                onChange={(e) => setGoalForm({ ...goalForm, targetAmount: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Já Acumulado (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={goalForm.currentAmount}
                onChange={(e) => setGoalForm({ ...goalForm, currentAmount: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewGoalModal(false)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950"
            >
              Salvar Meta
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
