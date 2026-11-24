import React, { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Landmark,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useWealth } from "../contexts/WealthContext";
import { brl, formatDate, monthLabel, pct, todayIso } from "../lib/format";
import { calculatePmt, summarizeDebt } from "../lib/finance-engine";
import { Badge, EmptyState, Modal, Panel, ProgressBar, SectionHeader, StatCard } from "./ui/WealthUI";
import type { AmortizationSystem, DebtKind } from "../types/wealth";

export function DebtsLoansView() {
  const {
    state,
    upsertDebt,
    removeDebt,
    settleDebtInstallment,
    undoDebtInstallment,
    prepayMultipleInstallments,
  } = useWealth();

  const [selectedDebtId, setSelectedDebtId] = useState<string>(state.debts[0]?.id || "");
  const [showNewDebtModal, setShowNewDebtModal] = useState(false);

  // Estado para baixa individual de uma parcela
  const [settlingRow, setSettlingRow] = useState<number | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>("");
  const [settleDate, setSettleDate] = useState<string>(todayIso());

  // Estado para seleção múltipla de antecipação com desconto
  const [pickedForPrepay, setPickedForPrepay] = useState<number[]>([]);
  const [prepayTotalPaid, setPrepayTotalPaid] = useState<string>("");
  const [prepayDate, setPrepayDate] = useState<string>(todayIso());

  const [debtForm, setDebtForm] = useState({
    name: "",
    kind: "financing" as DebtKind,
    lender: "",
    amortizationSystem: "price" as AmortizationSystem,
    principal: "",
    interestRateMonthly: "0.85",
    installmentsTotal: "60",
    installmentAmount: "",
    startDate: todayIso(),
    dueDay: "10",
    categoryId: "cat_financiamento",
  });

  // Resumo enriquecido de todos os contratos
  const summaries = useMemo(
    () =>
      state.debts.map((debt) => ({
        debt,
        summary: summarizeDebt(debt),
      })),
    [state.debts],
  );

  const globalKpis = useMemo(() => {
    const totalPrincipalOpen = summaries.reduce((s, x) => s + x.summary.outstandingPrincipal, 0);
    const totalPaidSoFar = summaries.reduce((s, x) => s + x.summary.totalPaid, 0);
    const totalSavedDiscounts = summaries.reduce((s, x) => s + x.summary.totalDiscount, 0);
    const monthlyCommitment = summaries.reduce(
      (s, x) => s + (x.summary.openCount > 0 ? x.summary.currentInstallmentValue : 0),
      0,
    );
    return {
      totalPrincipalOpen,
      totalPaidSoFar,
      totalSavedDiscounts,
      monthlyCommitment,
    };
  }, [summaries]);

  const activeEntry =
    summaries.find((x) => x.debt.id === selectedDebtId) ?? summaries[0] ?? null;

  // Cálculo do simulador de antecipação
  const prepayMetrics = useMemo(() => {
    if (!activeEntry || pickedForPrepay.length === 0) return null;
    const rows = activeEntry.summary.schedule.filter((r) => pickedForPrepay.includes(r.n));
    const faceTotal = rows.reduce((s, r) => s + r.installment, 0);
    const principalTotal = rows.reduce((s, r) => s + r.principalAmortized, 0);
    const paidNum = Number(prepayTotalPaid.replace(",", ".")) || principalTotal;
    const discount = Math.max(0, faceTotal - paidNum);
    return {
      faceTotal,
      principalTotal,
      paidNum,
      discount,
    };
  }, [activeEntry, pickedForPrepay, prepayTotalPaid]);

  // Preview de prestação no modal de criação
  const formPmtPreview = useMemo(() => {
    const p = Number(debtForm.principal.replace(",", ".")) || 0;
    const r = (Number(debtForm.interestRateMonthly.replace(",", ".")) || 0) / 100;
    const n = Number(debtForm.installmentsTotal) || 0;
    if (p <= 0 || n <= 0) return null;
    if (debtForm.amortizationSystem === "fixed" && debtForm.installmentAmount) {
      return Number(debtForm.installmentAmount.replace(",", ".")) || 0;
    }
    return calculatePmt(p, r, n);
  }, [debtForm]);

  const togglePickPrepay = (n: number, defaultPrincipal: number) => {
    setPickedForPrepay((prev) => {
      const next = prev.includes(n)
        ? prev.filter((x) => x !== n)
        : [...prev, n].sort((a, b) => a - b);

      if (activeEntry && next.length > 0) {
        const sumPrincipal = activeEntry.summary.schedule
          .filter((r) => next.includes(r.n))
          .reduce((s, r) => s + r.principalAmortized, 0);
        setPrepayTotalPaid(sumPrincipal.toFixed(2));
      } else {
        setPrepayTotalPaid("");
      }
      return next;
    });
  };

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const principal = Number(debtForm.principal.replace(",", "."));
    const total = Number(debtForm.installmentsTotal);
    const rate = Number(debtForm.interestRateMonthly.replace(",", ".")) || 0;
    if (!debtForm.name.trim() || !Number.isFinite(principal) || principal <= 0 || total <= 0) {
      toast.error("Preencha o nome do contrato, valor financiado e total de parcelas.");
      return;
    }

    upsertDebt({
      name: debtForm.name.trim(),
      kind: debtForm.kind,
      lender: debtForm.lender.trim() || "Instituição Financeira",
      amortizationSystem: debtForm.amortizationSystem,
      principal,
      interestRateMonthly: rate,
      installmentsTotal: total,
      installmentAmount:
        debtForm.amortizationSystem === "fixed"
          ? Number(debtForm.installmentAmount.replace(",", ".")) || undefined
          : undefined,
      startDate: debtForm.startDate,
      dueDay: Math.min(28, Math.max(1, Number(debtForm.dueDay) || 10)),
      categoryId: debtForm.categoryId || "cat_financiamento",
    });

    toast.success("Financiamento / Empréstimo cadastrado com sucesso!");
    setShowNewDebtModal(false);
    setDebtForm((prev) => ({ ...prev, name: "", lender: "", principal: "" }));
  };

  const handleConfirmPrepay = () => {
    if (!activeEntry || !prepayMetrics || pickedForPrepay.length === 0) return;
    prepayMultipleInstallments(
      activeEntry.debt.id,
      pickedForPrepay,
      prepayMetrics.paidNum,
      prepayMetrics.faceTotal,
      prepayDate,
    );
    toast.success(
      `${pickedForPrepay.length} parcela(s) antecipada(s)! Economia de juros: ${brl(prepayMetrics.discount)}`,
    );
    setPickedForPrepay([]);
    setPrepayTotalPaid("");
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Amortização, Baixa de Parcelas & Antecipação"
        title="Financiamentos, Empréstimos & Dívidas"
        subtitle="Acompanhe contratos pela Tabela Price, SAC ou Parcelas Fixas, dê baixa nas parcelas pagas e antecipe prestações com desconto"
        actions={
          <button
            onClick={() => setShowNewDebtModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow transition hover:bg-amber-400"
          >
            <Plus className="size-4" />
            Novo Financiamento / Empréstimo
          </button>
        }
      />

      {/* KPIs Globais de Financiamentos */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saldo Devedor (Principal)"
          value={brl(globalKpis.totalPrincipalOpen)}
          tone="negative"
          icon={<Landmark className="size-4 text-rose-400" />}
          hint="Capital líquido restante para quitação"
        />
        <StatCard
          label="Comprometimento Mensal"
          value={brl(globalKpis.monthlyCommitment)}
          tone="gold"
          hint="Soma das parcelas mensais ativas"
        />
        <StatCard
          label="Total Já Baixado / Pago"
          value={brl(globalKpis.totalPaidSoFar)}
          tone="positive"
          hint="Soma histórica de parcelas quitadas"
        />
        <StatCard
          label="Economia em Antecipações"
          value={brl(globalKpis.totalSavedDiscounts)}
          tone="sky"
          icon={<Sparkles className="size-4 text-sky-400" />}
          hint="Juros economizados com amortizações"
        />
      </div>

      {/* Lista de Contratos + Cronograma de Baixas do Contrato Selecionado */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Coluna Esquerda: Contratos Ativos */}
        <div className="space-y-4">
          <Panel
            title="Meus Contratos"
            subtitle="Selecione um contrato para dar baixa ou antecipar parcelas"
          >
            {summaries.length === 0 ? (
              <EmptyState title="Nenhum financiamento cadastrado" />
            ) : (
              <div className="space-y-3">
                {summaries.map(({ debt, summary }) => {
                  const isSelected = activeEntry?.debt.id === debt.id;
                  return (
                    <div
                      key={debt.id}
                      onClick={() => {
                        setSelectedDebtId(debt.id);
                        setPickedForPrepay([]);
                        setSettlingRow(null);
                      }}
                      className={`cursor-pointer rounded-xl border p-4 transition ${
                        isSelected
                          ? "border-amber-500/60 bg-amber-500/10"
                          : "border-slate-800 bg-slate-950/70 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-100">{debt.name}</h3>
                            <Badge tone="neutral">{debt.amortizationSystem.toUpperCase()}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {debt.lender} · {pct(debt.interestRateMonthly, 2)} a.m. · Vence dia{" "}
                            {debt.dueDay}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeDebt(debt.id);
                          }}
                          className="rounded p-1 text-slate-500 hover:text-rose-400"
                          title="Excluir contrato"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] uppercase text-slate-400">Parcela</span>
                          <p className="font-mono font-semibold text-slate-200 tabular-nums">
                            {brl(summary.currentInstallmentValue)}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-400">Pagas</span>
                          <p className="font-mono font-semibold text-emerald-400 tabular-nums">
                            {summary.paidCount}/{summary.totalCount}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-400">Saldo</span>
                          <p className="font-mono font-bold text-rose-400 tabular-nums">
                            {brl(summary.outstandingPrincipal)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5">
                        <ProgressBar pct={summary.progressPct} tone="positive" height="h-1.5" />
                      </div>

                      {summary.nextOpen && (
                        <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5">
                          <span className="text-[11px] text-slate-400">
                            Próxima: #{summary.nextOpen.n} ({monthLabel(summary.nextOpen.month)})
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              settleDebtInstallment(
                                debt.id,
                                summary.nextOpen!.n,
                                summary.nextOpen!.installment,
                                summary.nextOpen!.installment,
                                todayIso(),
                                false,
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                          >
                            <Check className="size-3" />
                            Baixar #{summary.nextOpen.n}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Painel de Antecipação Múltipla com Desconto */}
          {activeEntry && (
            <Panel
              title="Antecipar Parcelas com Desconto"
              subtitle="Marque checkboxes na tabela ao lado (ex.: últimas parcelas) para amortizar sem juros"
            >
              {pickedForPrepay.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Selecione uma ou mais parcelas em aberto na tabela ao lado para simular e
                  registrar uma antecipação com desconto.
                </p>
              ) : (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div>
                      <span className="text-[10px] uppercase text-slate-400">
                        Parcelas ({pickedForPrepay.length})
                      </span>
                      <p className="font-mono text-xs font-bold text-slate-200">
                        #{pickedForPrepay.join(", #")}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-400">Valor de Face</span>
                      <p className="font-mono text-xs text-slate-300 tabular-nums">
                        {brl(prepayMetrics?.faceTotal)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-400">
                        Principal Puro
                      </span>
                      <p className="font-mono text-xs text-sky-400 tabular-nums">
                        {brl(prepayMetrics?.principalTotal)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-400">
                        Desconto / Economia
                      </span>
                      <p className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                        {brl(prepayMetrics?.discount)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">
                        Valor Efetivo Pago (R$)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={prepayTotalPaid}
                        onChange={(e) => setPrepayTotalPaid(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-sm text-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">
                        Data da Quitação
                      </label>
                      <input
                        type="date"
                        value={prepayDate}
                        onChange={(e) => setPrepayDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-sm text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmPrepay}
                      className="flex-1 rounded-xl bg-emerald-500 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      Confirmar Antecipação
                    </button>
                    <button
                      onClick={() => setPickedForPrepay([])}
                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* Coluna Direita: Tabela Completa de Parcelas e Baixas */}
        {activeEntry ? (
          <Panel
            title={`Cronograma de Parcelas — ${activeEntry.debt.name}`}
            subtitle={`${activeEntry.summary.paidCount} de ${activeEntry.summary.totalCount} parcelas baixadas (${pct(activeEntry.summary.progressPct, 1)} concluído)`}
          >
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900">
                  <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="pb-3 pr-2">Antecipar</th>
                    <th className="pb-3 pr-2">#</th>
                    <th className="pb-3 pr-3">Vencimento</th>
                    <th className="pb-3 pr-3 text-right">Prestação</th>
                    <th className="pb-3 pr-3 text-right">Juros</th>
                    <th className="pb-3 pr-3 text-right">Amortização</th>
                    <th className="pb-3 pr-3 text-right">Saldo Devedor</th>
                    <th className="pb-3 text-right">Status / Baixa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activeEntry.summary.schedule.map((row) => {
                    const isSettlingThis = settlingRow === row.n;
                    return (
                      <tr
                        key={row.n}
                        className={`transition ${
                          row.isPaid
                            ? "bg-emerald-950/10 text-slate-400"
                            : "hover:bg-slate-800/35"
                        }`}
                      >
                        <td className="py-2.5 pr-2">
                          {row.isPaid ? (
                            <CheckCircle2 className="size-4 text-emerald-400" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={pickedForPrepay.includes(row.n)}
                              onChange={() => togglePickPrepay(row.n, row.principalAmortized)}
                              className="size-4 rounded border-slate-700 bg-slate-900 accent-amber-500"
                            />
                          )}
                        </td>
                        <td className="py-2.5 pr-2 font-mono text-xs font-semibold">
                          #{row.n}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs">
                          {monthLabel(row.month)}
                          {row.isPaid && row.paidDate && (
                            <span className="ml-2 text-[11px] text-emerald-400">
                              (pago {formatDate(row.paidDate)})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums">
                          {brl(row.installment)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-xs text-slate-400 tabular-nums">
                          {brl(row.interest)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-xs text-slate-300 tabular-nums">
                          {brl(row.principalAmortized)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-xs tabular-nums">
                          {brl(row.remainingBalance)}
                        </td>
                        <td className="py-2.5 text-right">
                          {isSettlingThis ? (
                            <div className="inline-flex items-center gap-1.5">
                              <input
                                type="date"
                                value={settleDate}
                                onChange={(e) => setSettleDate(e.target.value)}
                                className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100"
                              />
                              <input
                                type="text"
                                inputMode="decimal"
                                value={settleAmount}
                                onChange={(e) => setSettleAmount(e.target.value)}
                                className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-xs text-emerald-400"
                              />
                              <button
                                onClick={() => {
                                  const val =
                                    Number(settleAmount.replace(",", ".")) || row.installment;
                                  settleDebtInstallment(
                                    activeEntry.debt.id,
                                    row.n,
                                    val,
                                    row.installment,
                                    settleDate,
                                    val < row.installment * 0.95,
                                  );
                                  setSettlingRow(null);
                                }}
                                className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-slate-950"
                              >
                                OK
                              </button>
                              <button
                                onClick={() => setSettlingRow(null)}
                                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400"
                              >
                                ✕
                              </button>
                            </div>
                          ) : row.isPaid ? (
                            <div className="inline-flex items-center gap-2">
                              <Badge tone={row.isPrepaid ? "sky" : "positive"}>
                                {row.isPrepaid ? "Antecipada" : "Baixada"} ({brl(row.paidAmount)})
                              </Badge>
                              <button
                                onClick={() => undoDebtInstallment(activeEntry.debt.id, row.n)}
                                title="Desfazer baixa"
                                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-amber-300"
                              >
                                <RotateCcw className="size-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setSettlingRow(row.n);
                                setSettleAmount(row.installment.toFixed(2));
                                setSettleDate(todayIso());
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:text-emerald-300"
                            >
                              <Check className="size-3.5" />
                              Baixar Parcela
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : (
          <EmptyState title="Cadastre um financiamento para visualizar a tabela de parcelas" />
        )}
      </div>

      {/* Modal de Novo Financiamento / Empréstimo */}
      <Modal
        open={showNewDebtModal}
        onClose={() => setShowNewDebtModal(false)}
        title="Cadastrar Financiamento ou Empréstimo"
        subtitle="Suporta Tabela Price, Sistema SAC ou Parcelas Fixas pré-acordadas"
      >
        <form onSubmit={handleCreateDebt} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Identificação do Contrato
            </label>
            <input
              type="text"
              placeholder="Ex.: Financiamento Imobiliário Itaú, Empréstimo Veículo..."
              value={debtForm.name}
              onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Modalidade</label>
              <select
                value={debtForm.kind}
                onChange={(e) => setDebtForm({ ...debtForm, kind: e.target.value as DebtKind })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="financing">Financiamento</option>
                <option value="loan">Empréstimo Pessoal</option>
                <option value="consortium">Consórcio Contemplado</option>
                <option value="installment_agreement">Parcelamento / Acordo</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Sistema</label>
              <select
                value={debtForm.amortizationSystem}
                onChange={(e) =>
                  setDebtForm({
                    ...debtForm,
                    amortizationSystem: e.target.value as AmortizationSystem,
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="price">Tabela Price</option>
                <option value="sac">Tabela SAC</option>
                <option value="fixed">Parcela Fixa Manual</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Banco / Credor
              </label>
              <input
                type="text"
                placeholder="Ex: Itaú, Caixa, Safra"
                value={debtForm.lender}
                onChange={(e) => setDebtForm({ ...debtForm, lender: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Valor Financiado (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="150000"
                value={debtForm.principal}
                onChange={(e) => setDebtForm({ ...debtForm, principal: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Taxa Juros (% a.m.)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={debtForm.interestRateMonthly}
                onChange={(e) =>
                  setDebtForm({ ...debtForm, interestRateMonthly: e.target.value })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nº Total de Parcelas
              </label>
              <input
                type="number"
                min="1"
                max="420"
                value={debtForm.installmentsTotal}
                onChange={(e) =>
                  setDebtForm({ ...debtForm, installmentsTotal: e.target.value })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                required
              />
            </div>
          </div>

          {debtForm.amortizationSystem === "fixed" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Valor Fixo da Parcela (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={debtForm.installmentAmount}
                onChange={(e) =>
                  setDebtForm({ ...debtForm, installmentAmount: e.target.value })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Data da 1ª Parcela
              </label>
              <input
                type="date"
                value={debtForm.startDate}
                onChange={(e) => setDebtForm({ ...debtForm, startDate: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Dia de Vencimento Mensal
              </label>
              <input
                type="number"
                min="1"
                max="28"
                value={debtForm.dueDay}
                onChange={(e) => setDebtForm({ ...debtForm, dueDay: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          </div>

          {formPmtPreview !== null && formPmtPreview > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Prestação inicial estimada: <strong className="font-mono">{brl(formPmtPreview)}</strong>/mês
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewDebtModal(false)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Salvar Contrato
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
