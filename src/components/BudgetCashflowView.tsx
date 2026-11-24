import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useWealth } from "../contexts/WealthContext";
import {
  addMonthsIso,
  brl,
  compactBrl,
  currentMonthIso,
  monthLabel,
  MONTHS_SHORT,
  uid,
} from "../lib/format";
import {
  computeBudgetLineMonthValue,
  expandCardPurchaseSchedule,
  summarizeDebt,
} from "../lib/finance-engine";
import { Badge, EmptyState, Modal, Panel, ProgressBar, SectionHeader, StatCard } from "./ui/WealthUI";
import type { SalaryDeduction } from "../types/wealth";

export function BudgetCashflowView({ initialMode = "orcamento" }: { initialMode?: "orcamento" | "fluxo" }) {
  const { state, upsertBudgetItem, removeBudgetItem } = useWealth();
  const [viewTab, setViewTab] = useState<"orcamento" | "grade12m" | "fluxo">(
    initialMode === "fluxo" ? "fluxo" : "orcamento",
  );
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIso());
  const [expandedSalaryIds, setExpandedSalaryIds] = useState<Record<string, boolean>>({
    b_sal: true,
  });
  const [showAddBudgetModal, setShowAddBudgetModal] = useState(false);

  const [bForm, setBForm] = useState({
    name: "",
    type: "expense" as "income" | "expense",
    categoryId: "cat_moradia",
    group: "Essenciais",
    baseValue: "",
    adjustType: "ipca" as "none" | "ipca" | "igpm" | "customPct",
    adjustMonth: "1",
    hasDeductions: false,
    dedName1: "INSS",
    dedAmount1: "908.85",
    dedName2: "IRRF",
    dedAmount2: "2500.00",
  });

  // 1. Comparativo Orçado × Projetado × Realizado por Categoria no Mês Selecionado
  const categoryComparison = useMemo(() => {
    const mIndex = Number(selectedMonth.slice(5, 7)) || 1;
    const cardEntriesMonth = state.cardPurchases
      .flatMap(expandCardPurchaseSchedule)
      .filter((e) => e.month === selectedMonth);

    return state.categories
      .filter((c) => c.kind === "expense")
      .map((cat) => {
        const budgetLines = state.budgetItems.filter(
          (b) => b.categoryId === cat.id && b.type === "expense",
        );
        const lineBudgetSum = budgetLines.reduce(
          (s, b) => s + computeBudgetLineMonthValue(b, mIndex, state.settings).net,
          0,
        );
        const budgeted = lineBudgetSum > 0 ? lineBudgetSum : cat.monthlyBudget;

        const txRealized = state.transactions
          .filter(
            (t) =>
              t.categoryId === cat.id &&
              t.status === "realized" &&
              t.date.slice(0, 7) === selectedMonth,
          )
          .reduce((s, t) => s + Number(t.amount), 0);

        const txPlanned = state.transactions
          .filter(
            (t) =>
              t.categoryId === cat.id &&
              t.status === "planned" &&
              t.date.slice(0, 7) === selectedMonth,
          )
          .reduce((s, t) => s + Number(t.amount), 0);

        const cardCatSum = cardEntriesMonth
          .filter((e) => e.categoryId === cat.id && !e.isPaid)
          .reduce((s, e) => s + e.amount, 0);

        const projected = Math.max(budgeted, txRealized + txPlanned + cardCatSum);

        return {
          category: cat,
          budgeted,
          projected,
          realized: txRealized + cardCatSum,
        };
      });
  }, [state.categories, state.budgetItems, state.transactions, state.cardPurchases, selectedMonth, state.settings]);

  // 2. Grade Anual de 12 Meses (com Salário Bruto -> Deduções -> Líquido e Reajuste IPCA/IGP-M)
  const annualGrid = useMemo(() => {
    const incomes = state.budgetItems.filter((b) => b.type === "income");
    const expenses = state.budgetItems.filter((b) => b.type === "expense");

    const monthlyTotals = Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const inc = incomes.reduce(
        (s, b) => s + computeBudgetLineMonthValue(b, m, state.settings).net,
        0,
      );
      const exp = expenses.reduce(
        (s, b) => s + computeBudgetLineMonthValue(b, m, state.settings).net,
        0,
      );
      return { monthIndex: m, inc, exp, net: inc - exp };
    });

    return { incomes, expenses, monthlyTotals };
  }, [state.budgetItems, state.settings]);

  // 3. Fluxo de Caixa Projetado de 12 Meses (Saldo Acumulado)
  const cashflow12m = useMemo(() => {
    const opening =
      state.accounts.reduce((s, a) => s + (Number(a.openingBalance) || 0), 0) +
      state.transactions
        .filter((t) => t.status === "realized")
        .reduce((s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)), 0);

    const debtSummaries = state.debts.map(summarizeDebt);
    const allCardExpanded = state.cardPurchases.flatMap(expandCardPurchaseSchedule);

    let runningBalance = opening;
    const startYm = currentMonthIso();

    return Array.from({ length: 12 }, (_, i) => {
      const ym = addMonthsIso(startYm, i);
      const mIndex = Number(ym.slice(5, 7)) || 1;

      const budgetIncome = state.budgetItems
        .filter((b) => b.type === "income")
        .reduce((s, b) => s + computeBudgetLineMonthValue(b, mIndex, state.settings).net, 0);

      const budgetFixedExpense = state.budgetItems
        .filter((b) => b.type === "expense")
        .reduce((s, b) => s + computeBudgetLineMonthValue(b, mIndex, state.settings).net, 0);

      const cardMonth = allCardExpanded
        .filter((e) => e.month === ym && !e.isPaid)
        .reduce((s, e) => s + e.amount, 0);

      const debtMonth = debtSummaries.reduce((s, d) => {
        const row = d.schedule.find((r) => r.month === ym && !r.isPaid);
        return s + (row ? row.installment : 0);
      }, 0);

      const totalOut = budgetFixedExpense + cardMonth + debtMonth;
      const net = budgetIncome - totalOut;
      runningBalance += net;

      return {
        ym,
        label: monthLabel(ym),
        Entradas: Math.round(budgetIncome),
        Saidas: Math.round(totalOut),
        Resultado: Math.round(net),
        SaldoAcumulado: Math.round(runningBalance),
      };
    });
  }, [state]);

  const handleAddBudgetLine = (e: React.FormEvent) => {
    e.preventDefault();
    const baseValue = Number(bForm.baseValue.replace(",", "."));
    if (!bForm.name.trim() || !Number.isFinite(baseValue) || baseValue <= 0) {
      toast.error("Informe o nome e o valor base mensal.");
      return;
    }

    const deductions: SalaryDeduction[] = [];
    if (bForm.type === "income" && bForm.hasDeductions) {
      const d1 = Number(bForm.dedAmount1.replace(",", ".")) || 0;
      const d2 = Number(bForm.dedAmount2.replace(",", ".")) || 0;
      if (d1 > 0)
        deductions.push({
          id: uid("ded"),
          name: bForm.dedName1 || "INSS",
          amount: d1,
          adjustType: "none",
        });
      if (d2 > 0)
        deductions.push({
          id: uid("ded"),
          name: bForm.dedName2 || "IRRF",
          amount: d2,
          adjustType: "none",
        });
    }

    upsertBudgetItem({
      name: bForm.name.trim(),
      type: bForm.type,
      categoryId: bForm.categoryId,
      group: bForm.group,
      mode: "fixed",
      baseValue,
      adjustType: bForm.adjustType,
      adjustMonth: Number(bForm.adjustMonth) || 1,
      deductions,
    });

    toast.success("Linha orçamentária adicionada!");
    setShowAddBudgetModal(false);
    setBForm((prev) => ({ ...prev, name: "", baseValue: "" }));
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Planejamento Financeiro & Folha"
        title="Orçamento (Orçado × Projetado × Realizado) & Fluxo 12 Meses"
        subtitle="Compare metas de gastos, decomponha salário bruto/líquido com reajuste por IPCA/IGP-M e projete o caixa futuro"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "orcamento", label: "Orçado × Projetado × Realizado" },
              { id: "grade12m", label: "Grade Anual 12M & Salário Bruto/Líquido" },
              { id: "fluxo", label: "Fluxo de Caixa Projetado" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setViewTab(t.id as typeof viewTab)}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  viewTab === t.id
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      {/* ABA 1: ORÇADO x PROJETADO x REALIZADO */}
      {viewTab === "orcamento" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700">
              Competência analisada:{" "}
              <span className="font-mono text-slate-800">{monthLabel(selectedMonth)}</span>
            </h3>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Total Orçado (Meta Despesas)"
              value={brl(categoryComparison.reduce((s, r) => s + r.budgeted, 0))}
              tone="gold"
            />
            <StatCard
              label="Total Projetado (Com Faturas)"
              value={brl(categoryComparison.reduce((s, r) => s + r.projected, 0))}
              tone="sky"
            />
            <StatCard
              label="Total Realizado + Cartão"
              value={brl(categoryComparison.reduce((s, r) => s + r.realized, 0))}
              tone="negative"
            />
          </div>

          <Panel
            title="Acompanhamento por Categoria de Despesa"
            subtitle="Inclui gastos diretos em conta e parcelas de cartão de crédito da categoria"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="pb-3 pr-3">Categoria</th>
                    <th className="pb-3 pr-3 text-right">Orçado</th>
                    <th className="pb-3 pr-3 text-right">Projetado</th>
                    <th className="pb-3 pr-3 text-right">Realizado</th>
                    <th className="pb-3 pr-3">Consumo do Orçamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {categoryComparison.map((row) => {
                    const ratio = row.budgeted > 0 ? (row.realized / row.budgeted) * 100 : 0;
                    return (
                      <tr key={row.category.id} className="hover:bg-slate-50">
                        <td className="py-3.5 pr-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: row.category.color }}
                            />
                            <span className="font-medium text-slate-900">{row.category.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 pr-3 text-right font-mono text-slate-700 tabular-nums">
                          {brl(row.budgeted)}
                        </td>
                        <td className="py-3.5 pr-3 text-right font-mono text-sky-700 tabular-nums">
                          {brl(row.projected)}
                        </td>
                        <td className="py-3.5 pr-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {brl(row.realized)}
                        </td>
                        <td className="py-3.5 pr-3">
                          <div className="w-48">
                            <div className="mb-1 flex justify-between font-mono text-xs">
                              <span
                                className={
                                  ratio > 100 ? "text-rose-700 font-bold" : "text-slate-700"
                                }
                              >
                                {ratio.toFixed(0)}%
                              </span>
                              <span className="text-slate-500">
                                {row.budgeted - row.realized >= 0
                                  ? `livre ${brl(row.budgeted - row.realized)}`
                                  : `excedeu ${brl(row.realized - row.budgeted)}`}
                              </span>
                            </div>
                            <ProgressBar
                              pct={ratio}
                              tone={ratio > 100 ? "negative" : "gold"}
                              height="h-1.5"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* ABA 2: GRADE ANUAL 12 MESES & DECOMPOSIÇÃO SALÁRIO BRUTO/LÍQUIDO */}
      {viewTab === "grade12m" && (
        <div className="space-y-6">
          <Panel
            title="Linhas do Orçamento Anual & Decomposição de Salário (Bruto → Líquido)"
            subtitle={`Ano de referência ${state.settings.referenceYear} · IPCA ${state.settings.ipcaAnnual}% · IGP-M ${state.settings.igpmAnnual}%`}
            actions={
              <button
                onClick={() => setShowAddBudgetModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 text-white px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="size-3.5" />
                Nova Linha Orçamentária
              </button>
            }
          >
            <div className="space-y-3">
              {state.budgetItems.map((item) => {
                const hasDed = (item.deductions || []).length > 0;
                const isExp = expandedSalaryIds[item.id];
                const jan = computeBudgetLineMonthValue(item, 1, state.settings);
                const dec = computeBudgetLineMonthValue(item, 12, state.settings);

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {hasDed && (
                          <button
                            onClick={() =>
                              setExpandedSalaryIds((p) => ({ ...p, [item.id]: !p[item.id] }))
                            }
                            className="rounded p-1 text-slate-500 hover:bg-slate-100"
                          >
                            {isExp ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{item.name}</span>
                            <Badge tone={item.type === "income" ? "positive" : "negative"}>
                              {item.type === "income" ? "Receita" : "Despesa"}
                            </Badge>
                            {item.adjustType !== "none" && (
                              <Badge tone="sky">
                                Reajuste {item.adjustType.toUpperCase()} (Mês {item.adjustMonth || 1})
                              </Badge>
                            )}
                          </div>
                          {hasDed && (
                            <p className="mt-0.5 text-xs text-slate-500">
                              Bruto: {brl(jan.gross)} → Deduções folha: -{brl(jan.deductions)} →
                              Líquido inicial: <strong className="text-emerald-700">{brl(jan.net)}</strong>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right font-mono">
                          <span className="text-xs text-slate-500">Jan → Dez: </span>
                          <span className="text-sm font-bold text-slate-900 tabular-nums">
                            {brl(jan.net)} → {brl(dec.net)}
                          </span>
                        </div>
                        <button
                          onClick={() => removeBudgetItem(item.id)}
                          className="rounded p-1 text-slate-500 hover:text-rose-700"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>

                    {hasDed && isExp && (
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-800">
                          Decomposição de Folha (Descontos sobre o Bruto)
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {(item.deductions || []).map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                            >
                              <span className="text-slate-700">{d.name}</span>
                              <span className="font-mono text-rose-700 tabular-nums">
                                - {brl(d.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            title={`Grade Anual Líquida (Jan a Dez/${state.settings.referenceYear})`}
            subtitle="Valores líquidos mensais considerando o mês de aniversário do reajuste por IPCA ou IGP-M"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left uppercase text-slate-500">
                    <th className="pb-2.5 pr-3">Linha Orçamentária</th>
                    {MONTHS_SHORT.map((m) => (
                      <th key={m} className="pb-2.5 pr-2 text-right">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {[...annualGrid.incomes, ...annualGrid.expenses].map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap py-2.5 pr-3 font-medium text-slate-800">
                        {item.name}
                      </td>
                      {MONTHS_SHORT.map((_, idx) => {
                        const val = computeBudgetLineMonthValue(item, idx + 1, state.settings).net;
                        return (
                          <td
                            key={idx}
                            className={`whitespace-nowrap py-2.5 pr-2 text-right font-mono tabular-nums ${
                              item.type === "income" ? "text-emerald-700" : "text-slate-700"
                            }`}
                          >
                            {brl(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 bg-slate-50/70 font-bold">
                    <td className="py-3 pr-3 text-slate-900">Saldo Orçado Líquido</td>
                    {annualGrid.monthlyTotals.map((t) => (
                      <td
                        key={t.monthIndex}
                        className={`whitespace-nowrap py-3 pr-2 text-right font-mono tabular-nums ${
                          t.net >= 0 ? "text-slate-800" : "text-rose-700"
                        }`}
                      >
                        {brl(t.net)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* ABA 3: FLUXO DE CAIXA PROJETADO 12 MESES */}
      {viewTab === "fluxo" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Evolução do Saldo Acumulado (Próximos 12 Meses)"
              subtitle="Considera saldo bancário atual + orçamento líquido − faturas parceladas − financiamentos"
            >
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashflow12m}>
                    <defs>
                      <linearGradient id="gradCash" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickFormatter={(v) => compactBrl(Number(v))}
                    />
                    <Tooltip
                      formatter={(v: number) => brl(v)}
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderColor: "#e2e8f0",
                        borderRadius: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="SaldoAcumulado"
                      name="Caixa Acumulado"
                      stroke="#D4AF37"
                      strokeWidth={2.5}
                      fill="url(#gradCash)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel
              title="Entradas vs. Saídas Comprometidas (12 Meses)"
              subtitle="Visão mensal de geração de caixa livre"
            >
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashflow12m}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickFormatter={(v) => compactBrl(Number(v))}
                    />
                    <Tooltip
                      formatter={(v: number) => brl(v)}
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderColor: "#e2e8f0",
                        borderRadius: 12,
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Entradas" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Saidas" name="Saídas" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* Modal de Nova Linha Orçamentária */}
      <Modal
        open={showAddBudgetModal}
        onClose={() => setShowAddBudgetModal(false)}
        title="Nova Linha do Orçamento Anual"
        subtitle="Suporta deduções de folha (Salário Bruto -> Líquido) e reajuste anual por IPCA/IGP-M"
      >
        <form onSubmit={handleAddBudgetLine} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Tipo</label>
              <select
                value={bForm.type}
                onChange={(e) =>
                  setBForm({ ...bForm, type: e.target.value as "income" | "expense" })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="income">Receita</option>
                <option value="expense">Despesa Fixa / Orçada</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Valor Base Mensal (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="5000,00"
                value={bForm.baseValue}
                onChange={(e) => setBForm({ ...bForm, baseValue: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Descrição</label>
            <input
              type="text"
              placeholder="Ex.: Salário Bruto CLT, Condomínio, Escola..."
              value={bForm.name}
              onChange={(e) => setBForm({ ...bForm, name: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Índice de Reajuste
              </label>
              <select
                value={bForm.adjustType}
                onChange={(e) =>
                  setBForm({
                    ...bForm,
                    adjustType: e.target.value as typeof bForm.adjustType,
                  })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="none">Sem reajuste</option>
                <option value="ipca">IPCA ({state.settings.ipcaAnnual}%)</option>
                <option value="igpm">IGP-M ({state.settings.igpmAnnual}%)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Mês do Reajuste (1 a 12)
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={bForm.adjustMonth}
                onChange={(e) => setBForm({ ...bForm, adjustMonth: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
              />
            </div>
          </div>

          {bForm.type === "income" && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="flex items-center gap-2 text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={bForm.hasDeductions}
                  onChange={(e) => setBForm({ ...bForm, hasDeductions: e.target.checked })}
                />
                Incluir deduções de folha (INSS / IRRF) para calcular Salário Líquido
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddBudgetModal(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 text-white px-5 py-2 text-xs font-semibold text-white"
            >
              Salvar Linha
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
