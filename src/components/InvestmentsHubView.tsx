import React, { useMemo, useState } from "react";
import {
  CloudUpload,
  Coins,
  ExternalLink,
  HandCoins,
  Landmark,
  Layers,
  MinusCircle,
  Plus,
  PlusCircle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
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
import { toast } from "sonner";
import { useWealth } from "../contexts/WealthContext";
import {
  brl,
  compactBrl,
  formatDate,
  pct,
  todayIso,
} from "../lib/format";
import {
  buildWealthPerspective,
  computeStatsFromTrades,
  enrichVariableAssets,
  evaluateFixedIncomeAsset,
  isFixedTypeTaxExempt,
} from "../lib/finance-engine";
import {
  Badge,
  EmptyState,
  Modal,
  Panel,
  ProgressBar,
  SectionHeader,
  StatCard,
} from "./ui/WealthUI";
import type {
  FixedIncomeType,
  FixedRateType,
  InvestmentFund,
  VariableAssetType,
} from "../types/wealth";

type InvestSubTab = "overview" | "variable" | "fixed" | "magic";

const PIE_PALETTE = ["#D4AF37", "#10B981", "#38BDF8", "#A855F7", "#F43F5E", "#F59E0B", "#64748B"];

export function InvestmentsHubView() {
  const {
    state,
    isSyncingSheet,
    updateSettings,
    upsertVariableAsset,
    removeVariableAsset,
    recordTrade,
    removeTrade,
    recordDividend,
    removeDividend,
    syncWithGoogleSheet,
    pushAllTickersToGoogleSheet,
    upsertFixedIncome,
    removeFixedIncome,
    upsertFund,
    removeFund,
  } = useWealth();

  const [subTab, setSubTab] = useState<InvestSubTab>("overview");

  // Simulador de Perspectiva
  const [monthlyAporteSim, setMonthlyAporteSim] = useState(4500);
  const [yearsHorizonSim, setYearsHorizonSim] = useState(5);
  const [expectedAnnualRateSim, setExpectedAnnualRateSim] = useState(11.5);

  // Simulador "Onde Aportar" (Número Mágico)
  const [newContributionBudget, setNewContributionBudget] = useState(2500);

  // Modal de Ordem Rápida (Compra / Venda de Ação/FII)
  const [tradeModal, setTradeModal] = useState<{
    open: boolean;
    side: "buy" | "sell";
    ticker: string;
    assetType: VariableAssetType;
    price: string;
    quantity: string;
    fees: string;
    segment: string;
    pvp: string;
    tradeDate: string;
  }>({
    open: false,
    side: "buy",
    ticker: "",
    assetType: "Ação",
    price: "",
    quantity: "100",
    fees: "0",
    segment: "Geral B3",
    pvp: "1.00",
    tradeDate: todayIso(),
  });

  // Modal de Rendimento / Dividendo Rápido
  const [divModal, setDivModal] = useState<{
    open: boolean;
    ticker: string;
    type: "Dividendo" | "JCP" | "Rendimento FII" | "Bonificação";
    amount: string;
    perShare: string;
    payDate: string;
    notes: string;
  }>({
    open: false,
    ticker: "",
    type: "Dividendo",
    amount: "",
    perShare: "",
    payDate: todayIso(),
    notes: "",
  });

  // Modal de Cotações Manuais & Índices
  const [quotesModalOpen, setQuotesModalOpen] = useState(false);
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [manualRates, setManualRates] = useState({
    cdi: String(state.settings.cdiAnnual),
    selic: String(state.settings.selicAnnual),
    ipca: String(state.settings.ipcaAnnual),
  });

  // Formulário de Novo Título de Renda Fixa / Tesouro
  const [fixedForm, setFixedForm] = useState({
    title: "",
    institution: "Tesouro Direto / XP",
    type: "Tesouro IPCA+" as FixedIncomeType,
    rateType: "ipcaMais" as FixedRateType,
    rateValue: "6.40",
    principal: "",
    applicationDate: todayIso(),
    maturityDate: "2035-05-15",
    noMaturity: false,
  });

  // Formulário de Novo Fundo
  const [fundForm, setFundForm] = useState({
    name: "",
    institution: "",
    type: "Multimercado" as InvestmentFund["type"],
    investedAmount: "",
    currentValue: "",
  });

  // 1. Ativos de Renda Variável Enriquecidos
  const enrichedVariable = useMemo(
    () => enrichVariableAssets(state.variableAssets, state.dividends),
    [state.variableAssets, state.dividends],
  );

  const tradeStatsMap = useMemo(
    () => computeStatsFromTrades(state.trades),
    [state.trades],
  );

  // 2. Títulos de Renda Fixa Avaliados na Curva + IR Regressivo
  const evaluatedFixed = useMemo(
    () =>
      state.fixedIncome.map((asset) => ({
        asset,
        eval: evaluateFixedIncomeAsset(asset, state.settings),
      })),
    [state.fixedIncome, state.settings],
  );

  // 3. Consolidação Global da Carteira
  const globalTotals = useMemo(() => {
    const varInvested = enrichedVariable.reduce((s, a) => s + a.investedTotal, 0);
    const varMarket = enrichedVariable.reduce((s, a) => s + a.marketValue, 0);
    const varDividends = state.dividends.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const varMonthlyPassive = enrichedVariable.reduce(
      (s, a) => s + a.estimatedMonthlyPassiveIncome,
      0,
    );
    const realizedSalesPnl = Array.from(tradeStatsMap.values()).reduce(
      (s, t) => s + t.realizedPnl,
      0,
    );

    const fixedInvested = evaluatedFixed.reduce((s, f) => s + f.eval.principal, 0);
    const fixedNetToday = evaluatedFixed.reduce((s, f) => s + f.eval.netToday, 0);
    const fixedAtMaturity = evaluatedFixed.reduce((s, f) => s + f.eval.netAtMaturity, 0);

    const fundsInvested = state.funds.reduce((s, f) => s + (Number(f.investedAmount) || 0), 0);
    const fundsCurrent = state.funds.reduce((s, f) => s + (Number(f.currentValue) || 0), 0);

    const totalInvested = varInvested + fixedInvested + fundsInvested;
    const totalCurrentNet = varMarket + fixedNetToday + fundsCurrent;
    const totalProfitWithDividends =
      totalCurrentNet - totalInvested + varDividends + realizedSalesPnl;
    const totalReturnPct =
      totalInvested > 0 ? (totalProfitWithDividends / totalInvested) * 100 : 0;

    return {
      varInvested,
      varMarket,
      varDividends,
      varMonthlyPassive,
      realizedSalesPnl,
      fixedInvested,
      fixedNetToday,
      fixedAtMaturity,
      fundsInvested,
      fundsCurrent,
      totalInvested,
      totalCurrentNet,
      totalProfitWithDividends,
      totalReturnPct,
    };
  }, [enrichedVariable, state.dividends, tradeStatsMap, evaluatedFixed, state.funds]);

  // 4. Perspectiva Multi-Anos (Simulador de Juros Compostos)
  const perspectiveData = useMemo(
    () =>
      buildWealthPerspective(
        globalTotals.totalCurrentNet,
        monthlyAporteSim,
        expectedAnnualRateSim,
        yearsHorizonSim,
      ),
    [globalTotals.totalCurrentNet, monthlyAporteSim, expectedAnnualRateSim, yearsHorizonSim],
  );

  // 5. Alocação por Classe e por Segmento
  const classAllocation = useMemo(() => {
    const acoes = enrichedVariable
      .filter((a) => a.type === "Ação")
      .reduce((s, a) => s + a.marketValue, 0);
    const fiis = enrichedVariable
      .filter((a) => a.type === "FII")
      .reduce((s, a) => s + a.marketValue, 0);
    const etfBdr = enrichedVariable
      .filter((a) => a.type !== "Ação" && a.type !== "FII")
      .reduce((s, a) => s + a.marketValue, 0);
    const tesouro = evaluatedFixed
      .filter((f) => f.asset.type.startsWith("Tesouro"))
      .reduce((s, f) => s + f.eval.netToday, 0);
    const rfPrivada = evaluatedFixed
      .filter((f) => !f.asset.type.startsWith("Tesouro"))
      .reduce((s, f) => s + f.eval.netToday, 0);

    return [
      { name: "Ações B3", value: Math.round(acoes) },
      { name: "Fundos Imobiliários (FIIs)", value: Math.round(fiis) },
      { name: "ETFs / Internacional", value: Math.round(etfBdr) },
      { name: "Tesouro Direto", value: Math.round(tesouro) },
      { name: "Renda Fixa Bancária (CDB/LCI/LCA)", value: Math.round(rfPrivada) },
      { name: "Fundos & Previdência", value: Math.round(globalTotals.fundsCurrent) },
    ].filter((x) => x.value > 0);
  }, [enrichedVariable, evaluatedFixed, globalTotals.fundsCurrent]);

  // 6. Recomendação "Onde Aportar" pelo Score (P/VP + DY + Número Mágico)
  const allocationPlan = useMemo(() => {
    const ranked = [...enrichedVariable]
      .filter((a) => a.currentPrice > 0)
      .sort((a, b) => b.buyScore - a.buyScore);

    let remaining = newContributionBudget;
    const suggestions: {
      ticker: string;
      sharesToBuy: number;
      cost: number;
      addedMonthlyIncome: number;
      score: number;
    }[] = [];

    for (const asset of ranked.slice(0, 5)) {
      const targetGap =
        asset.magicMissingShares > 0
          ? asset.magicMissingShares
          : asset.targetShares
            ? Math.max(1, asset.targetShares - asset.quantity)
            : 50;
      const maxAffordable = Math.floor(remaining / asset.currentPrice);
      const shares = Math.min(maxAffordable, targetGap);
      if (shares <= 0) continue;
      const cost = shares * asset.currentPrice;
      remaining -= cost;
      suggestions.push({
        ticker: asset.ticker,
        sharesToBuy: shares,
        cost,
        addedMonthlyIncome: shares * asset.lastDividendPerShare,
        score: asset.buyScore,
      });
    }

    return { suggestions, remaining };
  }, [enrichedVariable, newContributionBudget]);

  // Handlers de Modais
  const openQuickTrade = (
    side: "buy" | "sell",
    ticker = "",
    assetType: VariableAssetType = "Ação",
    currentPrice = 0,
    segment = "Geral B3",
    pvp: number | null = 1.0,
  ) => {
    setTradeModal({
      open: true,
      side,
      ticker,
      assetType,
      price: currentPrice > 0 ? String(currentPrice) : "",
      quantity: "10",
      fees: "0",
      segment,
      pvp: pvp ? String(pvp) : "1.00",
      tradeDate: todayIso(),
    });
  };

  const openQuickDividend = (ticker = "", typeHint: "Ação" | "FII" | string = "Ação") => {
    setDivModal({
      open: true,
      ticker,
      type: typeHint === "FII" ? "Rendimento FII" : "Dividendo",
      amount: "",
      perShare: "",
      payDate: todayIso(),
      notes: "",
    });
  };

  const handleConfirmTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = tradeModal.ticker.trim().toUpperCase();
    const qty = Number(tradeModal.quantity.replace(",", "."));
    const price = Number(tradeModal.price.replace(",", "."));
    const fees = Number(tradeModal.fees.replace(",", ".")) || 0;
    const pvp = Number(tradeModal.pvp.replace(",", ".")) || null;

    if (!ticker || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
      toast.error("Preencha Ticker, Quantidade e Preço válidos.");
      return;
    }

    await recordTrade({
      ticker,
      assetType: tradeModal.assetType,
      side: tradeModal.side,
      quantity: qty,
      price,
      fees,
      tradeDate: tradeModal.tradeDate,
      segment: tradeModal.segment,
      pvp,
    });

    setTradeModal((prev) => ({ ...prev, open: false }));
  };

  const handleConfirmDividend = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = divModal.ticker.trim().toUpperCase();
    const amount = Number(divModal.amount.replace(",", "."));
    const perShare = Number(divModal.perShare.replace(",", ".")) || undefined;

    if (!ticker || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe o Ticker e o valor total recebido.");
      return;
    }

    recordDividend({
      ticker,
      type: divModal.type,
      amount,
      perShare,
      payDate: divModal.payDate,
      notes: divModal.notes.trim() || undefined,
    });
    setDivModal((prev) => ({ ...prev, open: false }));
  };

  const handleSaveManualQuotes = (e: React.FormEvent) => {
    e.preventDefault();
    for (const asset of state.variableAssets) {
      const raw = manualPrices[asset.id];
      if (raw !== undefined) {
        const num = Number(raw.replace(",", "."));
        if (Number.isFinite(num) && num > 0) {
          upsertVariableAsset({ ...asset, currentPrice: num });
        }
      }
    }
    updateSettings({
      cdiAnnual: Number(manualRates.cdi.replace(",", ".")) || state.settings.cdiAnnual,
      selicAnnual: Number(manualRates.selic.replace(",", ".")) || state.settings.selicAnnual,
      ipcaAnnual: Number(manualRates.ipca.replace(",", ".")) || state.settings.ipcaAnnual,
    });
    toast.success("Cotações e taxas CDI/SELIC/IPCA atualizadas!");
    setQuotesModalOpen(false);
  };

  const handleCreateFixedIncome = (e: React.FormEvent) => {
    e.preventDefault();
    const principal = Number(fixedForm.principal.replace(",", "."));
    const rateValue = Number(fixedForm.rateValue.replace(",", "."));
    if (!fixedForm.title.trim() || !Number.isFinite(principal) || principal <= 0) {
      toast.error("Informe o título e o valor aplicado.");
      return;
    }
    upsertFixedIncome({
      title: fixedForm.title.trim(),
      institution: fixedForm.institution.trim() || "Corretora",
      type: fixedForm.type,
      rateType: fixedForm.rateType,
      rateValue: Number.isFinite(rateValue) ? rateValue : 100,
      principal,
      applicationDate: fixedForm.applicationDate,
      maturityDate: fixedForm.noMaturity ? null : fixedForm.maturityDate,
      noMaturity: fixedForm.noMaturity,
      taxExempt: isFixedTypeTaxExempt(fixedForm.type),
      coupons: [],
    });
    toast.success("Título de Renda Fixa / Tesouro adicionado!");
    setFixedForm((prev) => ({ ...prev, title: "", principal: "" }));
  };

  const handleCreateFund = (e: React.FormEvent) => {
    e.preventDefault();
    const inv = Number(fundForm.investedAmount.replace(",", "."));
    const cur = Number(fundForm.currentValue.replace(",", ".")) || inv;
    if (!fundForm.name.trim() || !Number.isFinite(inv) || inv <= 0) {
      toast.error("Informe o nome do fundo e o valor aplicado.");
      return;
    }
    upsertFund({
      name: fundForm.name.trim(),
      institution: fundForm.institution.trim() || "Corretora",
      type: fundForm.type,
      investedAmount: inv,
      currentValue: cur,
    });
    toast.success("Fundo de investimento cadastrado!");
    setFundForm({
      name: "",
      institution: "",
      type: "Multimercado",
      investedAmount: "",
      currentValue: "",
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Central de Ativos & GOOGLEFINANCE"
        title="Carteira de Investimentos & Perspectiva Patrimonial"
        subtitle="Ações, FIIs (sincronizados com Planilha Google), Tesouro Direto, Renda Fixa (com IR regressivo), Fundos e Proventos"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openQuickTrade("buy")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow transition hover:bg-amber-400"
            >
              <PlusCircle className="size-4" />
              Lançar Compra / Venda
            </button>
            <button
              onClick={() => openQuickDividend()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
            >
              <HandCoins className="size-4" />
              Lançar Rendimento / Dividendo
            </button>
            <button
              onClick={syncWithGoogleSheet}
              disabled={isSyncingSheet}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-400/50 hover:text-amber-300"
            >
              <RefreshCw className={`size-3.5 ${isSyncingSheet ? "animate-spin" : ""}`} />
              Sincronizar GOOGLEFINANCE
            </button>
            <button
              onClick={() => {
                const map: Record<string, string> = {};
                state.variableAssets.forEach((a) => {
                  map[a.id] = String(a.currentPrice);
                });
                setManualPrices(map);
                setManualRates({
                  cdi: String(state.settings.cdiAnnual),
                  selic: String(state.settings.selicAnnual),
                  ipca: String(state.settings.ipcaAnnual),
                });
                setQuotesModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              <SlidersHorizontal className="size-3.5" />
              Cotações & CDI/SELIC
            </button>
          </div>
        }
      />

      {/* KPIs Consolidados de Todos os Investimentos */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Patrimônio Investido Atual"
          value={brl(globalTotals.totalCurrentNet)}
          tone="gold"
          hint={`Custo aplicado: ${brl(globalTotals.totalInvested)}`}
        />
        <StatCard
          label="Renda Variável (Ações/FIIs/ETFs)"
          value={brl(globalTotals.varMarket)}
          tone="default"
          hint={`${state.variableAssets.length} ativos na B3`}
        />
        <StatCard
          label="Renda Fixa & Tesouro (Líquido)"
          value={brl(globalTotals.fixedNetToday)}
          tone="sky"
          hint={`No vencimento: ${brl(globalTotals.fixedAtMaturity)}`}
        />
        <StatCard
          label="Proventos & Dividendos"
          value={brl(globalTotals.varDividends)}
          tone="positive"
          hint={`Renda passiva est.: ${brl(globalTotals.varMonthlyPassive)}/mês`}
        />
        <StatCard
          label="Resultado Real Total"
          value={brl(globalTotals.totalProfitWithDividends)}
          tone={globalTotals.totalProfitWithDividends >= 0 ? "positive" : "negative"}
          hint={`Rentabilidade global: ${pct(globalTotals.totalReturnPct)}`}
        />
      </div>

      {/* Sub-navegação interna da Central de Investimentos */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "overview", label: "1. Visão Consolidada & Perspectiva" },
            { id: "variable", label: "2. Ações, FIIs, Ordens & Proventos (GOOGLEFINANCE)" },
            { id: "fixed", label: "3. Renda Fixa, Tesouro Direto & Fundos" },
            { id: "magic", label: "4. Número Mágico & Onde Aportar" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as InvestSubTab)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                subTab === tab.id
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "border border-slate-800 bg-slate-900/70 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {state.settings.googleSpreadsheetUrl && (
          <a
            href={state.settings.googleSpreadsheetUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Abrir Planilha Google
          </a>
        )}
      </div>

      {/* =====================================================================
          ABA 1: VISÃO CONSOLIDADA & PERSPECTIVA PATRIMONIAL
         ===================================================================== */}
      {subTab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Simulador de Perspectiva Patrimonial */}
            <Panel
              title="Perspectiva de Crescimento Patrimonial (Juros Compostos)"
              subtitle="Projeção combinando sua carteira atual + aportes mensais em 3 cenários (Conservador, Base CDI/IPCA+ e Otimista)"
              className="lg:col-span-2"
            >
              <div className="mb-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] uppercase text-slate-400">
                    Aporte Mensal Planejado (R$)
                  </label>
                  <input
                    type="number"
                    step="250"
                    value={monthlyAporteSim}
                    onChange={(e) => setMonthlyAporteSim(Number(e.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase text-slate-400">
                    Rentabilidade Anual Base (%)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    value={expectedAnnualRateSim}
                    onChange={(e) => setExpectedAnnualRateSim(Number(e.target.value) || 10)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase text-slate-400">
                    Horizonte (Anos)
                  </label>
                  <select
                    value={yearsHorizonSim}
                    onChange={(e) => setYearsHorizonSim(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-slate-100"
                  >
                    <option value={1}>1 Ano (12 meses)</option>
                    <option value={3}>3 Anos (36 meses)</option>
                    <option value={5}>5 Anos (60 meses)</option>
                    <option value={10}>10 Anos (120 meses)</option>
                    <option value={15}>15 Anos (180 meses)</option>
                  </select>
                </div>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={perspectiveData}>
                    <defs>
                      <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradOpt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="yearLabel" stroke="#94a3b8" fontSize={12} />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={12}
                      tickFormatter={(v) => compactBrl(Number(v))}
                    />
                    <Tooltip
                      formatter={(v: number) => brl(v)}
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: 12,
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="totalInvestedCapital"
                      name="Capital Desembolsado"
                      stroke="#64748B"
                      strokeDasharray="4 4"
                      fill="transparent"
                    />
                    <Area
                      type="monotone"
                      dataKey="basePatrimony"
                      name="Cenário Base"
                      stroke="#D4AF37"
                      strokeWidth={2.5}
                      fill="url(#gradBase)"
                    />
                    <Area
                      type="monotone"
                      dataKey="optimisticPatrimony"
                      name="Cenário Otimista"
                      stroke="#10B981"
                      fill="url(#gradOpt)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {perspectiveData.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="text-[11px] uppercase text-slate-400">
                      Patrimônio Base em {yearsHorizonSim} ano(s)
                    </span>
                    <p className="mt-1 font-mono text-lg font-bold text-amber-400 tabular-nums">
                      {brl(perspectiveData[perspectiveData.length - 1]?.basePatrimony)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="text-[11px] uppercase text-slate-400">
                      Juros Compostos Ganhos
                    </span>
                    <p className="mt-1 font-mono text-lg font-bold text-emerald-400 tabular-nums">
                      +
                      {brl(
                        (perspectiveData[perspectiveData.length - 1]?.basePatrimony ?? 0) -
                          (perspectiveData[perspectiveData.length - 1]?.totalInvestedCapital ?? 0),
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="text-[11px] uppercase text-slate-400">
                      Renda Passiva Mensal Estimada
                    </span>
                    <p className="mt-1 font-mono text-lg font-bold text-sky-400 tabular-nums">
                      {brl(
                        perspectiveData[perspectiveData.length - 1]?.estimatedMonthlyPassiveIncome,
                      )}
                      /mês
                    </p>
                  </div>
                </div>
              )}
            </Panel>

            {/* Alocação por Subclasse de Ativos */}
            <Panel
              title="Alocação por Classe de Ativo"
              subtitle="Equilíbrio entre Renda Variável, Tesouro Direto, Renda Fixa e Fundos"
            >
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={classAllocation}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {classAllocation.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => brl(v)}
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-2">
                {classAllocation.map((item, idx) => {
                  const share =
                    globalTotals.totalCurrentNet > 0
                      ? (item.value / globalTotals.totalCurrentNet) * 100
                      : 0;
                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between text-xs text-slate-300"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: PIE_PALETTE[idx % PIE_PALETTE.length] }}
                        />
                        {item.name}
                      </span>
                      <span className="font-mono tabular-nums">
                        {brl(item.value)} ({pct(share, 1)})
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 2: RENDA VARIÁVEL (AÇÕES, FIIs, ORDENS & PROVENTOS + GOOGLEFINANCE)
         ===================================================================== */}
      {subTab === "variable" && (
        <div className="space-y-6">
          <Panel
            title="Posições de Renda Variável (Ações, FIIs, ETFs)"
            subtitle="Preço médio ponderado, cotação atualizada via GOOGLEFINANCE, proventos acumulados e rentabilidade real (Valorização + Dividendos)"
            actions={
              <div className="flex items-center gap-2">
                <button
                  onClick={pushAllTickersToGoogleSheet}
                  disabled={isSyncingSheet}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400/50 hover:text-amber-300"
                >
                  <CloudUpload className="size-3.5" />
                  Enviar Carteira p/ Planilha
                </button>
              </div>
            }
          >
            {enrichedVariable.length === 0 ? (
              <EmptyState
                title="Nenhum ativo de renda variável na carteira"
                description="Clique em 'Lançar Compra / Venda' ou sincronize com sua Planilha Google."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="pb-3 pr-3">Ativo / Segmento</th>
                      <th className="pb-3 pr-3 text-right">Qtde</th>
                      <th className="pb-3 pr-3 text-right">Preço Médio</th>
                      <th className="pb-3 pr-3 text-right">Cotação Hoje</th>
                      <th className="pb-3 pr-3 text-right">Saldo Total</th>
                      <th className="pb-3 pr-3 text-right">Proventos Recebidos</th>
                      <th className="pb-3 pr-3 text-right">Rentabilidade Real</th>
                      <th className="pb-3 text-center">Ações Rápidas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {enrichedVariable.map((inv) => {
                      const isPosDay = inv.dayChangePct >= 0;
                      const isPosTotal = inv.totalReturn >= 0;
                      return (
                        <tr key={inv.id} className="hover:bg-slate-800/35">
                          <td className="py-3.5 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-100">
                                {inv.ticker}
                              </span>
                              <Badge tone={inv.type === "FII" ? "sky" : "gold"}>{inv.type}</Badge>
                              {inv.pvp && (
                                <span className="font-mono text-[11px] text-slate-400">
                                  P/VP {inv.pvp.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                              <span>{inv.segment}</span>
                              <span>·</span>
                              <span
                                className={`inline-flex items-center gap-0.5 font-mono ${
                                  isPosDay ? "text-emerald-400" : "text-rose-400"
                                }`}
                              >
                                {isPosDay ? (
                                  <TrendingUp className="size-3" />
                                ) : (
                                  <TrendingDown className="size-3" />
                                )}
                                {inv.dayChangePct >= 0 ? "+" : ""}
                                {inv.dayChangePct.toFixed(2)}% hoje
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 pr-3 text-right font-mono text-slate-200 tabular-nums">
                            {inv.quantity}
                          </td>
                          <td className="py-3.5 pr-3 text-right font-mono text-slate-300 tabular-nums">
                            {brl(inv.averagePrice)}
                          </td>
                          <td className="py-3.5 pr-3 text-right font-mono font-semibold text-slate-100 tabular-nums">
                            {brl(inv.currentPrice)}
                          </td>
                          <td className="py-3.5 pr-3 text-right font-mono font-bold text-amber-400 tabular-nums">
                            {brl(inv.marketValue)}
                          </td>
                          <td className="py-3.5 pr-3 text-right font-mono text-emerald-400 tabular-nums">
                            {inv.dividendsReceived > 0 ? `+ ${brl(inv.dividendsReceived)}` : "—"}
                          </td>
                          <td
                            className={`py-3.5 pr-3 text-right font-mono font-bold tabular-nums ${
                              isPosTotal ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            <div>
                              {isPosTotal ? "+" : ""}
                              {pct(inv.totalReturnPct)}
                            </div>
                            <div className="text-xs font-normal opacity-80">
                              {brl(inv.totalReturn)}
                            </div>
                          </td>
                          <td className="py-3.5 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  openQuickTrade(
                                    "buy",
                                    inv.ticker,
                                    inv.type,
                                    inv.currentPrice,
                                    inv.segment,
                                    inv.pvp,
                                  )
                                }
                                title="Lançar Compra"
                                className="rounded-lg bg-slate-800 p-2 text-slate-300 transition hover:bg-sky-500 hover:text-slate-950"
                              >
                                <PlusCircle className="size-4" />
                              </button>
                              <button
                                onClick={() =>
                                  openQuickTrade(
                                    "sell",
                                    inv.ticker,
                                    inv.type,
                                    inv.currentPrice,
                                    inv.segment,
                                    inv.pvp,
                                  )
                                }
                                title="Registrar Venda"
                                className="rounded-lg bg-slate-800 p-2 text-slate-300 transition hover:bg-rose-500 hover:text-white"
                              >
                                <MinusCircle className="size-4" />
                              </button>
                              <button
                                onClick={() => openQuickDividend(inv.ticker, inv.type)}
                                title="Lançar Dividendo / Rendimento"
                                className="rounded-lg bg-slate-800 p-2 text-slate-300 transition hover:bg-emerald-500 hover:text-slate-950"
                              >
                                <HandCoins className="size-4" />
                              </button>
                              <button
                                onClick={() => removeVariableAsset(inv.id)}
                                title="Remover ativo"
                                className="rounded-lg bg-slate-800/60 p-2 text-slate-500 transition hover:bg-rose-500/20 hover:text-rose-400"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Histórico de Ordens e Histórico de Proventos lado a lado */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Histórico de Ordens (Compras & Vendas)"
              subtitle="Cálculo automático de preço médio e sincronização com a planilha"
            >
              {state.trades.length === 0 ? (
                <EmptyState title="Nenhuma ordem registrada" />
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-[11px] uppercase text-slate-400">
                        <th className="pb-2 pr-2">Data</th>
                        <th className="pb-2 pr-2">Ativo</th>
                        <th className="pb-2 pr-2">Tipo</th>
                        <th className="pb-2 pr-2 text-right">Qtd × Preço</th>
                        <th className="pb-2 pr-2 text-right">Total</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {state.trades.map((t) => (
                        <tr key={t.id}>
                          <td className="py-2.5 pr-2 font-mono text-xs text-slate-400">
                            {formatDate(t.tradeDate)}
                          </td>
                          <td className="py-2.5 pr-2 font-mono font-semibold text-slate-100">
                            {t.ticker}
                          </td>
                          <td className="py-2.5 pr-2">
                            <Badge tone={t.side === "buy" ? "positive" : "negative"}>
                              {t.side === "buy" ? "Compra" : "Venda"}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-2 text-right font-mono text-xs text-slate-300 tabular-nums">
                            {t.quantity} × {brl(t.price)}
                          </td>
                          <td className="py-2.5 pr-2 text-right font-mono font-semibold text-slate-100 tabular-nums">
                            {brl(t.quantity * t.price + t.fees)}
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => removeTrade(t.id)}
                              className="rounded p-1 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title="Proventos & Dividendos Recebidos"
              subtitle={`Total acumulado na carteira: ${brl(globalTotals.varDividends)}`}
            >
              {state.dividends.length === 0 ? (
                <EmptyState title="Nenhum provento lançado" />
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-[11px] uppercase text-slate-400">
                        <th className="pb-2 pr-2">Data</th>
                        <th className="pb-2 pr-2">Ativo</th>
                        <th className="pb-2 pr-2">Evento</th>
                        <th className="pb-2 pr-2 text-right">Valor Recebido</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {state.dividends.map((d) => (
                        <tr key={d.id}>
                          <td className="py-2.5 pr-2 font-mono text-xs text-slate-400">
                            {formatDate(d.payDate)}
                          </td>
                          <td className="py-2.5 pr-2 font-mono font-semibold text-slate-100">
                            {d.ticker}
                          </td>
                          <td className="py-2.5 pr-2 text-xs text-slate-300">{d.type}</td>
                          <td className="py-2.5 pr-2 text-right font-mono font-bold text-emerald-400 tabular-nums">
                            + {brl(d.amount)}
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => removeDividend(d.id)}
                              className="rounded p-1 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 3: RENDA FIXA, TESOURO DIRETO & FUNDOS
         ===================================================================== */}
      {subTab === "fixed" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            {/* Formulário de Novo Título de Renda Fixa / Tesouro */}
            <Panel
              title="Novo Título (Renda Fixa / Tesouro)"
              subtitle="Cálculo automático pela curva e alíquota regressiva de IR (ou isenção LCI/LCA)"
            >
              <form onSubmit={handleCreateFixedIncome} className="space-y-3.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Nome do Título
                  </label>
                  <input
                    type="text"
                    placeholder="Ex.: Tesouro IPCA+ 2035, CDB Banco Master 120% CDI"
                    value={fixedForm.title}
                    onChange={(e) => setFixedForm({ ...fixedForm, title: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Tipo</label>
                    <select
                      value={fixedForm.type}
                      onChange={(e) => {
                        const t = e.target.value as FixedIncomeType;
                        let rt = fixedForm.rateType;
                        if (t === "Tesouro IPCA+") rt = "ipcaMais";
                        else if (t === "Tesouro Selic") rt = "posSelic";
                        else if (t === "Tesouro Prefixado") rt = "pre";
                        setFixedForm({ ...fixedForm, type: t, rateType: rt });
                      }}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="Tesouro IPCA+">Tesouro IPCA+</option>
                      <option value="Tesouro Selic">Tesouro Selic</option>
                      <option value="Tesouro Prefixado">Tesouro Prefixado</option>
                      <option value="CDB">CDB</option>
                      <option value="LCI">LCI (Isento IR)</option>
                      <option value="LCA">LCA (Isento IR)</option>
                      <option value="CRI">CRI (Isento IR)</option>
                      <option value="CRA">CRA (Isento IR)</option>
                      <option value="Debênture">Debênture</option>
                      <option value="Caixinha / Liquidez Diária">Caixinha / Liquidez Diária</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Instituição / Custódia
                    </label>
                    <input
                      type="text"
                      value={fixedForm.institution}
                      onChange={(e) =>
                        setFixedForm({ ...fixedForm, institution: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Indexador
                    </label>
                    <select
                      value={fixedForm.rateType}
                      onChange={(e) =>
                        setFixedForm({
                          ...fixedForm,
                          rateType: e.target.value as FixedRateType,
                        })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="posCDI">% do CDI</option>
                      <option value="posSelic">% da SELIC</option>
                      <option value="ipcaMais">IPCA + Taxa Fixa (%)</option>
                      <option value="pre">Pré-fixado (% a.a.)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Taxa ({fixedForm.rateType === "posCDI" ? "% CDI" : "% a.a."})
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fixedForm.rateValue}
                      onChange={(e) => setFixedForm({ ...fixedForm, rateValue: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Valor Aplicado (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="10000,00"
                    value={fixedForm.principal}
                    onChange={(e) => setFixedForm({ ...fixedForm, principal: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Data Aplicação
                    </label>
                    <input
                      type="date"
                      value={fixedForm.applicationDate}
                      onChange={(e) =>
                        setFixedForm({ ...fixedForm, applicationDate: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Vencimento
                    </label>
                    <input
                      type="date"
                      disabled={fixedForm.noMaturity}
                      value={fixedForm.maturityDate}
                      onChange={(e) =>
                        setFixedForm({ ...fixedForm, maturityDate: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 disabled:opacity-40"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                >
                  Adicionar Título
                </button>
              </form>
            </Panel>

            {/* Lista de Títulos de Renda Fixa & Tesouro */}
            <Panel
              title="Títulos de Renda Fixa & Tesouro Direto"
              subtitle={`Indexadores hoje: CDI ${state.settings.cdiAnnual}% · SELIC ${state.settings.selicAnnual}% · IPCA ${state.settings.ipcaAnnual}%`}
            >
              <div className="space-y-4">
                {evaluatedFixed.map(({ asset, eval: ev }) => (
                  <div
                    key={asset.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/75 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-100">{asset.title}</h3>
                          <Badge tone={ev.exempt ? "positive" : "sky"}>
                            {ev.exempt ? "Isento de IR" : `IR Hoje: ${ev.irRateTodayPct}%`}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {asset.institution} · {asset.type} · {ev.rateLabel} (equiv.{" "}
                          {pct(ev.annualRatePct)} a.a.)
                        </p>
                      </div>
                      <button
                        onClick={() => removeFixedIncome(asset.id)}
                        className="rounded p-1.5 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {ev.elapsedPct !== null && (
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                          <span>Aplicado em {formatDate(asset.applicationDate)}</span>
                          <span>Vence em {formatDate(asset.maturityDate)}</span>
                        </div>
                        <ProgressBar pct={ev.elapsedPct} tone="sky" height="h-1.5" />
                      </div>
                    )}

                    <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <span className="text-[11px] uppercase text-slate-400">
                          Valor Aplicado
                        </span>
                        <p className="font-mono text-sm font-semibold text-slate-200 tabular-nums">
                          {brl(ev.principal)}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase text-slate-400">
                          Líquido Hoje
                        </span>
                        <p className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                          {brl(ev.netToday)}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase text-slate-400">
                          Ganho Líquido Hoje
                        </span>
                        <p className="font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                          +{brl(ev.netGainToday)} ({pct(ev.netGainTodayPct, 1)})
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase text-slate-400">
                          Projeção Vencimento
                        </span>
                        <p className="font-mono text-sm font-bold text-amber-400 tabular-nums">
                          {brl(ev.netAtMaturity)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Fundos de Investimento & Previdência */}
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <Panel title="Novo Fundo / Previdência" subtitle="Multimercado, PGBL/VGBL, Cambial...">
              <form onSubmit={handleCreateFund} className="space-y-3.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Nome do Fundo
                  </label>
                  <input
                    type="text"
                    placeholder="Ex.: Kinea Atlas Multimercado"
                    value={fundForm.name}
                    onChange={(e) => setFundForm({ ...fundForm, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Classe</label>
                    <select
                      value={fundForm.type}
                      onChange={(e) =>
                        setFundForm({
                          ...fundForm,
                          type: e.target.value as InvestmentFund["type"],
                        })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="Multimercado">Multimercado</option>
                      <option value="Renda Fixa">Renda Fixa</option>
                      <option value="Previdência (PGBL/VGBL)">Previdência (PGBL/VGBL)</option>
                      <option value="Ações">Fundo de Ações</option>
                      <option value="Cambial">Cambial / Ouro</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Instituição
                    </label>
                    <input
                      type="text"
                      value={fundForm.institution}
                      onChange={(e) => setFundForm({ ...fundForm, institution: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Valor Aplicado (R$)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fundForm.investedAmount}
                      onChange={(e) =>
                        setFundForm({ ...fundForm, investedAmount: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Saldo Atual (R$)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fundForm.currentValue}
                      onChange={(e) => setFundForm({ ...fundForm, currentValue: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                >
                  Salvar Fundo
                </button>
              </form>
            </Panel>

            <Panel title="Fundos de Investimento & Previdência">
              <div className="grid gap-4 sm:grid-cols-2">
                {state.funds.map((f) => {
                  const gain = f.currentValue - f.investedAmount;
                  const gainPct = f.investedAmount > 0 ? (gain / f.investedAmount) * 100 : 0;
                  return (
                    <div
                      key={f.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/75 p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-slate-100">{f.name}</h4>
                          <p className="text-xs text-slate-400">
                            {f.type} · {f.institution}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFund(f.id)}
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[10px] uppercase text-slate-400">Investido</span>
                          <p className="font-mono text-xs text-slate-300 tabular-nums">
                            {brl(f.investedAmount)}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-400">Atual</span>
                          <p className="font-mono text-sm font-bold text-slate-100 tabular-nums">
                            {brl(f.currentValue)}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-400">Resultado</span>
                          <p
                            className={`font-mono text-xs font-bold tabular-nums ${
                              gain >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {gain >= 0 ? "+" : ""}
                            {pct(gainPct, 1)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 4: NÚMERO MÁGICO (EFEITO BOLA DE NEVE) & SIMULADOR ONDE APORTAR
         ===================================================================== */}
      {subTab === "magic" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <Panel
              title="Simulador Inteligente: Onde Aportar?"
              subtitle="Algoritmo distribui seu novo aporte priorizando maior desconto P/VP (45%), Dividend Yield (35%) e proximidade do Número Mágico (20%)"
            >
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Valor Disponível para Aporte Hoje (R$)
                  </label>
                  <input
                    type="number"
                    step="100"
                    value={newContributionBudget}
                    onChange={(e) => setNewContributionBudget(Number(e.target.value) || 0)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-base font-bold text-amber-400"
                  />
                </div>

                <div className="space-y-2.5">
                  {allocationPlan.suggestions.map((s) => (
                    <div
                      key={s.ticker}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-100">{s.ticker}</span>
                          <Badge tone="gold">Score {s.score}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          Comprar <strong className="text-slate-200">{s.sharesToBuy} cotas</strong>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-slate-100 tabular-nums">
                          {brl(s.cost)}
                        </p>
                        <p className="font-mono text-[11px] text-emerald-400 tabular-nums">
                          +{brl(s.addedMonthlyIncome)}/mês
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
                  <span>Troco / Sobra do aporte:</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {brl(allocationPlan.remaining)}
                  </span>
                </div>
              </div>
            </Panel>

            <Panel
              title="Ranking de Ativos & Número Mágico (Bola de Neve)"
              subtitle="Quantas cotas são necessárias para que os próprios dividendos mensais comprem uma nova cota sozinhos"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="pb-2.5 pr-3">Ativo</th>
                      <th className="pb-2.5 pr-3">Nota</th>
                      <th className="pb-2.5 pr-3 text-right">P/VP</th>
                      <th className="pb-2.5 pr-3 text-right">DY Mês</th>
                      <th className="pb-2.5 pr-3 text-right">YoC Mês</th>
                      <th className="pb-2.5 pr-3">Progresso Número Mágico</th>
                      <th className="pb-2.5 text-right">Custo p/ Atingir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {[...enrichedVariable]
                      .sort((a, b) => b.buyScore - a.buyScore)
                      .map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/30">
                          <td className="py-3 pr-3">
                            <p className="font-mono font-bold text-slate-100">{r.ticker}</p>
                            <p className="text-[11px] text-slate-400">
                              {r.quantity} cotas · {brl(r.currentPrice)}
                            </p>
                          </td>
                          <td className="py-3 pr-3">
                            <Badge
                              tone={
                                r.buyScore >= 70
                                  ? "positive"
                                  : r.buyScore >= 45
                                    ? "gold"
                                    : "neutral"
                              }
                            >
                              {r.buyScore}/100
                            </Badge>
                          </td>
                          <td
                            className={`py-3 pr-3 text-right font-mono tabular-nums ${
                              r.pvp && r.pvp < 1
                                ? "text-emerald-400 font-semibold"
                                : "text-slate-300"
                            }`}
                          >
                            {r.pvp ? r.pvp.toFixed(2) : "—"}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono text-slate-200 tabular-nums">
                            {r.monthlyDyPct > 0 ? pct(r.monthlyDyPct, 2) : "—"}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono text-amber-400 tabular-nums">
                            {r.yocPct > 0 ? pct(r.yocPct, 2) : "—"}
                          </td>
                          <td className="py-3 pr-3">
                            {r.magicNumber > 0 ? (
                              <div className="w-44">
                                <div className="mb-1 flex justify-between font-mono text-xs">
                                  <span>
                                    {r.quantity}/{r.magicNumber} cotas
                                  </span>
                                  <span className="text-slate-400">
                                    {r.magicMissingShares === 0
                                      ? "Atingido!"
                                      : `faltam ${r.magicMissingShares}`}
                                  </span>
                                </div>
                                <ProgressBar
                                  pct={r.magicProgressPct}
                                  tone={r.magicMissingShares === 0 ? "positive" : "gold"}
                                  height="h-1.5"
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">Sem dividendo mensal</span>
                            )}
                          </td>
                          <td className="py-3 text-right font-mono text-xs text-slate-300 tabular-nums">
                            {r.magicMissingCost > 0 ? brl(r.magicMissingCost) : "Conquistado"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: COMPRA / VENDA DE AÇÃO OU FII (COM SYNC GOOGLEFINANCE)
         ===================================================================== */}
      <Modal
        open={tradeModal.open}
        onClose={() => setTradeModal({ ...tradeModal, open: false })}
        title={
          tradeModal.side === "buy"
            ? "Registrar Ordem de Compra (Aquisição)"
            : "Registrar Ordem de Venda"
        }
        subtitle="Recalcula automaticamente o preço médio ponderado e sincroniza com a Planilha Google"
      >
        <form onSubmit={handleConfirmTrade} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Operação</label>
              <select
                value={tradeModal.side}
                onChange={(e) =>
                  setTradeModal({ ...tradeModal, side: e.target.value as "buy" | "sell" })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="buy">Compra (+)</option>
                <option value="sell">Venda (-)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Ticker (B3)
              </label>
              <input
                type="text"
                placeholder="Ex: PETR4, MXRF11"
                value={tradeModal.ticker}
                onChange={(e) =>
                  setTradeModal({ ...tradeModal, ticker: e.target.value.toUpperCase() })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm uppercase text-slate-100"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Classe</label>
              <select
                value={tradeModal.assetType}
                onChange={(e) =>
                  setTradeModal({
                    ...tradeModal,
                    assetType: e.target.value as VariableAssetType,
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="Ação">Ação</option>
                <option value="FII">FII</option>
                <option value="ETF">ETF</option>
                <option value="BDR">BDR</option>
                <option value="Cripto">Cripto</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Quantidade</label>
              <input
                type="text"
                inputMode="decimal"
                value={tradeModal.quantity}
                onChange={(e) => setTradeModal({ ...tradeModal, quantity: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Preço Unitário (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="35,50"
                value={tradeModal.price}
                onChange={(e) => setTradeModal({ ...tradeModal, price: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Taxas / Corretagem
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={tradeModal.fees}
                onChange={(e) => setTradeModal({ ...tradeModal, fees: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Segmento</label>
              <input
                type="text"
                value={tradeModal.segment}
                onChange={(e) => setTradeModal({ ...tradeModal, segment: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">P/VP Atual</label>
              <input
                type="text"
                inputMode="decimal"
                value={tradeModal.pvp}
                onChange={(e) => setTradeModal({ ...tradeModal, pvp: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Data Ordem</label>
              <input
                type="date"
                value={tradeModal.tradeDate}
                onChange={(e) => setTradeModal({ ...tradeModal, tradeDate: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTradeModal({ ...tradeModal, open: false })}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Confirmar & Sincronizar
            </button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL 2: LANÇAR RENDIMENTO / DIVIDENDO / JCP
         ===================================================================== */}
      <Modal
        open={divModal.open}
        onClose={() => setDivModal({ ...divModal, open: false })}
        title="Registrar Rendimento / Dividendo de Ação ou FII"
        subtitle="Soma na rentabilidade real do ativo e adiciona automaticamente às receitas do mês"
      >
        <form onSubmit={handleConfirmDividend} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Ticker do Ativo
              </label>
              <input
                type="text"
                placeholder="Ex: PETR4, MXRF11"
                value={divModal.ticker}
                onChange={(e) =>
                  setDivModal({ ...divModal, ticker: e.target.value.toUpperCase() })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm uppercase text-slate-100"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Tipo de Provento
              </label>
              <select
                value={divModal.type}
                onChange={(e) =>
                  setDivModal({
                    ...divModal,
                    type: e.target.value as typeof divModal.type,
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="Dividendo">Dividendo (Ações)</option>
                <option value="JCP">Juros s/ Capital Próprio (JCP)</option>
                <option value="Rendimento FII">Rendimento Mensal FII</option>
                <option value="Bonificação">Bonificação / Amortização</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Valor Total Recebido (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="250,00"
                value={divModal.amount}
                onChange={(e) => setDivModal({ ...divModal, amount: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-emerald-400"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Valor por Cota (opcional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,95"
                value={divModal.perShare}
                onChange={(e) => setDivModal({ ...divModal, perShare: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Data do Pagamento
              </label>
              <input
                type="date"
                value={divModal.payDate}
                onChange={(e) => setDivModal({ ...divModal, payDate: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDivModal({ ...divModal, open: false })}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Salvar Rendimento
            </button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL 3: ATUALIZAÇÃO MANUAL DE COTAÇÕES & ÍNDICES (FALLBACK)
         ===================================================================== */}
      <Modal
        open={quotesModalOpen}
        onClose={() => setQuotesModalOpen(false)}
        title="Atualização Rápida de Cotações & Indexadores"
        subtitle="Ajuste manualmente o preço do dia ou as taxas CDI, SELIC e IPCA"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveManualQuotes} className="space-y-4">
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                CDI Anual (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={manualRates.cdi}
                onChange={(e) => setManualRates({ ...manualRates, cdi: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-amber-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                SELIC Anual (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={manualRates.selic}
                onChange={(e) => setManualRates({ ...manualRates, selic: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-amber-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                IPCA 12m (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={manualRates.ipca}
                onChange={(e) => setManualRates({ ...manualRates, ipca: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-amber-400"
              />
            </div>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {state.variableAssets.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2"
              >
                <div>
                  <span className="font-mono font-bold text-slate-100">{a.ticker}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {a.type} · PM {brl(a.averagePrice)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Cotação R$:</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={manualPrices[a.id] ?? String(a.currentPrice)}
                    onChange={(e) =>
                      setManualPrices({ ...manualPrices, [a.id]: e.target.value })
                    }
                    className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-right font-mono text-sm text-slate-100"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setQuotesModalOpen(false)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Salvar Cotações & Taxas
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
