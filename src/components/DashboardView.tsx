import React, { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CreditCard,
  Landmark,
  Layers,
  PiggyBank,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useWealth } from "../contexts/WealthContext";
import {
  addMonthsIso,
  brl,
  compactBrl,
  currentMonthIso,
  monthFullLabel,
  monthLabel,
  pct,
} from "../lib/format";
import {
  computeBudgetLineMonthValue,
  enrichVariableAssets,
  evaluateFixedIncomeAsset,
  expandCardPurchaseSchedule,
  summarizeDebt,
} from "../lib/finance-engine";
import { Badge, EmptyState, Panel, ProgressBar, SectionHeader, StatCard } from "./ui/WealthUI";
import type { NavSectionId } from "../types/wealth";

const CHART_COLORS = ["#D4AF37", "#10B981", "#38BDF8", "#A855F7", "#F43F5E", "#F59E0B"];

export function DashboardView({ onNavigate }: { onNavigate: (tab: NavSectionId) => void }) {
  const { state } = useWealth();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIso());

  // 1. Saldo em Contas Correntes / Corretoras
  const cashBalance = useMemo(() => {
    const opening = state.accounts.reduce((s, a) => s + (Number(a.openingBalance) || 0), 0);
    const realizedMov = state.transactions
      .filter((t) => t.status === "realized")
      .reduce(
        (s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)),
        0,
      );
    return opening + realizedMov;
  }, [state.accounts, state.transactions]);

  // 2. Carteira Consolidada de Investimentos (Ações/FIIs + Renda Fixa/Tesouro + Fundos)
  const investmentsSummary = useMemo(() => {
    const enrichedVar = enrichVariableAssets(state.variableAssets, state.dividends);
    const varTotal = enrichedVar.reduce((s, a) => s + a.marketValue, 0);
    const passiveMonthlyVar = enrichedVar.reduce(
      (s, a) => s + a.estimatedMonthlyPassiveIncome,
      0,
    );

    const fixedTotal = state.fixedIncome.reduce(
      (s, f) => s + evaluateFixedIncomeAsset(f, state.settings).netToday,
      0,
    );

    const fundsTotal = state.funds.reduce((s, f) => s + (Number(f.currentValue) || 0), 0);

    const totalPortfolio = varTotal + fixedTotal + fundsTotal;
    return {
      varTotal,
      fixedTotal,
      fundsTotal,
      totalPortfolio,
      passiveMonthlyVar,
    };
  }, [state.variableAssets, state.dividends, state.fixedIncome, state.funds, state.settings]);

  // 3. Fatura de Cartões do Mês Selecionado
  const cardInvoiceThisMonth = useMemo(() => {
    return state.cardPurchases
      .flatMap(expandCardPurchaseSchedule)
      .filter((e) => e.month === selectedMonth)
      .reduce((s, e) => s + e.amount, 0);
  }, [state.cardPurchases, selectedMonth]);

  // 4. Dívidas e Financiamentos (Saldo Devedor Principal + Parcela Mensal)
  const debtSummary = useMemo(() => {
    const summaries = state.debts.map(summarizeDebt);
    const totalDebtBalance = summaries.reduce((s, d) => s + d.outstandingPrincipal, 0);
    const monthlyDebtCommitment = summaries.reduce((s, d) => {
      const rowThisMonth = d.schedule.find((r) => r.month === selectedMonth && !r.isPaid);
      return s + (rowThisMonth ? rowThisMonth.installment : 0);
    }, 0);
    const totalSavedDiscounts = summaries.reduce((s, d) => s + d.totalDiscount, 0);
    return { totalDebtBalance, monthlyDebtCommitment, totalSavedDiscounts };
  }, [state.debts, selectedMonth]);

  // 5. Receitas e Despesas do Mês Selecionado
  const monthFlow = useMemo(() => {
    const mTx = state.transactions.filter((t) => t.date.slice(0, 7) === selectedMonth);
    const realizedIncome = mTx
      .filter((t) => t.status === "realized" && t.kind === "income")
      .reduce((s, t) => s + Number(t.amount), 0);
    const realizedExpense = mTx
      .filter((t) => t.status === "realized" && t.kind === "expense")
      .reduce((s, t) => s + Number(t.amount), 0);

    // Somar fatura não paga do mês como compromisso previsto
    const unpaidCardMonth = state.cardPurchases
      .flatMap(expandCardPurchaseSchedule)
      .filter((e) => e.month === selectedMonth && !e.isPaid)
      .reduce((s, e) => s + e.amount, 0);

    const totalCommittedExpense =
      realizedExpense + unpaidCardMonth + debtSummary.monthlyDebtCommitment;

    const netResult = realizedIncome - totalCommittedExpense;
    const savingsRate = realizedIncome > 0 ? (netResult / realizedIncome) * 100 : 0;

    return {
      realizedIncome,
      realizedExpense,
      unpaidCardMonth,
      totalCommittedExpense,
      netResult,
      savingsRate,
    };
  }, [state.transactions, state.cardPurchases, selectedMonth, debtSummary]);

  // 6. Patrimônio Líquido
  const netWorth =
    cashBalance + investmentsSummary.totalPortfolio - debtSummary.totalDebtBalance;

  // 7. Série Histórica + Projeção (6 meses: -3 a +2)
  const timelineSeries = useMemo(() => {
    const months = [-2, -1, 0, 1, 2, 3].map((offset) => addMonthsIso(selectedMonth, offset));
    return months.map((m) => {
      const mIndex = Number(m.slice(5, 7)) || 1;
      const mTx = state.transactions.filter((t) => t.date.slice(0, 7) === m);
      const txInc = mTx
        .filter((t) => t.kind === "income")
        .reduce((s, t) => s + Number(t.amount), 0);
      const txExp = mTx
        .filter((t) => t.kind === "expense")
        .reduce((s, t) => s + Number(t.amount), 0);

      // Orçamento planejado caso seja mês futuro sem lançamentos
      const budgetInc = state.budgetItems
        .filter((b) => b.type === "income")
        .reduce((s, b) => s + computeBudgetLineMonthValue(b, mIndex, state.settings).net, 0);
      const budgetExp = state.budgetItems
        .filter((b) => b.type === "expense")
        .reduce((s, b) => s + computeBudgetLineMonthValue(b, mIndex, state.settings).net, 0);

      const cardExp = state.cardPurchases
        .flatMap(expandCardPurchaseSchedule)
        .filter((e) => e.month === m)
        .reduce((s, e) => s + e.amount, 0);

      const Receitas = Math.max(txInc, m > selectedMonth ? budgetInc : txInc);
      const Despesas = Math.max(txExp + cardExp, m > selectedMonth ? budgetExp + cardExp : txExp);

      return {
        month: monthLabel(m),
        Receitas: Math.round(Receitas),
        Despesas: Math.round(Despesas),
        Saldo: Math.round(Receitas - Despesas),
      };
    });
  }, [selectedMonth, state]);

  // 8. Alocação Patrimonial para o Gráfico de Rosca
  const allocationPie = useMemo(() => {
    const items = [
      { name: "Renda Variável (Ações/FIIs)", value: Math.round(investmentsSummary.varTotal) },
      { name: "Renda Fixa & Tesouro", value: Math.round(investmentsSummary.fixedTotal) },
      { name: "Fundos & Previdência", value: Math.round(investmentsSummary.fundsTotal) },
      { name: "Caixa & Contas", value: Math.round(Math.max(0, cashBalance)) },
    ].filter((x) => x.value > 0);
    return items;
  }, [investmentsSummary, cashBalance]);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Visão Executiva Consolidada"
        title="Patrimônio & Fluxo Mensal"
        subtitle={`Posição consolidada em ${monthFullLabel(selectedMonth)} — Ativos, Faturas, Financiamentos e Caixa`}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-amber-400 focus:outline-none"
            />
          </div>
        }
      />

      {/* Linha 1: 4 Grandes Pilares Patrimoniais */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Patrimônio Líquido"
          value={brl(netWorth)}
          tone="gold"
          icon={<Sparkles className="size-4 text-slate-800" />}
          hint="Investimentos + Caixa − Saldo Devedor"
        />
        <StatCard
          label="Total em Investimentos"
          value={brl(investmentsSummary.totalPortfolio)}
          tone="positive"
          icon={<TrendingUp className="size-4 text-emerald-700" />}
          hint={`Renda passiva est.: ${brl(investmentsSummary.passiveMonthlyVar)}/mês em FIIs/Ações`}
        />
        <StatCard
          label="Faturas de Cartão no Mês"
          value={brl(cardInvoiceThisMonth)}
          tone="negative"
          icon={<CreditCard className="size-4 text-rose-700" />}
          hint={`${state.creditCards.length} cartões monitorados`}
        />
        <StatCard
          label="Saldo Devedor (Financiamentos)"
          value={brl(debtSummary.totalDebtBalance)}
          tone="sky"
          icon={<Landmark className="size-4 text-sky-700" />}
          hint={`Economia em antecipações: ${brl(debtSummary.totalSavedDiscounts)}`}
        />
      </div>

      {/* Linha 2: Fluxo do Mês Selecionado */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Receitas Realizadas (Mês)"
          value={brl(monthFlow.realizedIncome)}
          tone="positive"
          icon={<ArrowUpRight className="size-4 text-emerald-700" />}
          hint="Salário líquido + aluguéis + dividendos"
        />
        <StatCard
          label="Saídas & Compromissos (Mês)"
          value={brl(monthFlow.totalCommittedExpense)}
          tone="negative"
          icon={<ArrowDownRight className="size-4 text-rose-700" />}
          hint={`Caixa: ${brl(monthFlow.realizedExpense)} + Fatura aberta: ${brl(monthFlow.unpaidCardMonth)}`}
        />
        <StatCard
          label="Saldo Livre do Mês"
          value={brl(monthFlow.netResult)}
          tone={monthFlow.netResult >= 0 ? "positive" : "negative"}
          icon={<Wallet className="size-4" />}
          hint={`Taxa de poupança: ${pct(monthFlow.savingsRate, 1)}`}
        />
        <StatCard
          label="Disponível em Contas / Caixa"
          value={brl(cashBalance)}
          tone="default"
          icon={<Building2 className="size-4 text-slate-500" />}
          hint={`${state.accounts.length} contas bancárias/corretoras`}
        />
      </div>

      {/* Gráficos Principais */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Evolução & Projeção de Caixa (Receitas × Despesas)"
          subtitle="Histórico recente e próximos meses considerando faturas parceladas e orçamento"
          className="lg:col-span-2"
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(v) => compactBrl(Number(v))}
                />
                <Tooltip
                  formatter={(v: number) => brl(v)}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#e2e8f0",
                    borderRadius: 12,
                    color: "#0f172a",
                  }}
                />
                <Legend />
                <Bar dataKey="Receitas" fill="#10B981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Despesas" fill="#F43F5E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Composição do Patrimônio"
          subtitle="Distribuição entre classes de ativos e liquidez"
        >
          {allocationPie.length === 0 ? (
            <EmptyState title="Sem ativos cadastrados" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocationPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                  >
                    {allocationPie.map((entry, idx) => (
                      <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => brl(v)}
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderColor: "#e2e8f0",
                      borderRadius: 12,
                      color: "#0f172a",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {/* Painéis de Acesso Rápido aos 4 Pilares Solicitados */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pilar 1: Resumo de Cartões */}
        <Panel
          title="Faturas de Cartão"
          subtitle={`Competência ${monthLabel(selectedMonth)}`}
          actions={
            <button
              onClick={() => onNavigate("cartoes")}
              className="text-xs font-medium text-slate-800 hover:underline"
            >
              Abrir faturas →
            </button>
          }
        >
          <div className="space-y-3">
            {state.creditCards.map((card) => {
              const entries = state.cardPurchases
                .filter((p) => p.cardId === card.id)
                .flatMap(expandCardPurchaseSchedule)
                .filter((e) => e.month === selectedMonth);
              const total = entries.reduce((s, e) => s + e.amount, 0);
              const pctLimit = card.limitAmount > 0 ? (total / card.limitAmount) * 100 : 0;
              return (
                <div
                  key={card.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{card.name}</p>
                      <p className="text-[11px] text-slate-500">
                        Fecha dia {card.closingDay} · Vence dia {card.dueDay}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-rose-700 tabular-nums">
                      {brl(total)}
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <ProgressBar pct={pctLimit} tone="purple" height="h-1.5" />
                    <p className="mt-1 text-[11px] text-slate-500">
                      {entries.length} lançamento(s) no mês · Limite {brl(card.limitAmount)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Pilar 2: Destaques da Carteira de Investimentos */}
        <Panel
          title="Carteira de Investimentos"
          subtitle="Ações, FIIs, Tesouro Direto e Renda Fixa"
          actions={
            <button
              onClick={() => onNavigate("investimentos")}
              className="text-xs font-medium text-slate-800 hover:underline"
            >
              Ver carteira completa →
            </button>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div>
                <p className="text-xs text-slate-500">Ações, FIIs & ETFs (B3)</p>
                <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                  {brl(investmentsSummary.varTotal)}
                </p>
              </div>
              <Badge tone="gold">{state.variableAssets.length} tickers</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div>
                <p className="text-xs text-slate-500">Renda Fixa & Tesouro (Líquido IR)</p>
                <p className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                  {brl(investmentsSummary.fixedTotal)}
                </p>
              </div>
              <Badge tone="positive">CDI {state.settings.cdiAnnual}%</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div>
                <p className="text-xs text-slate-500">Fundos & Previdência</p>
                <p className="font-mono text-sm font-bold text-sky-700 tabular-nums">
                  {brl(investmentsSummary.fundsTotal)}
                </p>
              </div>
              <Badge tone="sky">{state.funds.length} fundos</Badge>
            </div>
          </div>
        </Panel>

        {/* Pilar 3: Financiamentos & Empréstimos */}
        <Panel
          title="Financiamentos & Empréstimos"
          subtitle="Progresso de quitação e parcelas"
          actions={
            <button
              onClick={() => onNavigate("dividas")}
              className="text-xs font-medium text-slate-800 hover:underline"
            >
              Baixar parcelas →
            </button>
          }
        >
          <div className="space-y-3">
            {state.debts.map((debt) => {
              const s = summarizeDebt(debt);
              return (
                <div
                  key={debt.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{debt.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {debt.lender} · {s.paidCount}/{s.totalCount} pagas
                      </p>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-800 tabular-nums">
                      {brl(s.currentInstallmentValue)}/mês
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <ProgressBar pct={s.progressPct} tone="positive" height="h-1.5" />
                    <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                      <span>Quitado: {pct(s.progressPct, 0)}</span>
                      <span>Saldo: {brl(s.outstandingPrincipal)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
