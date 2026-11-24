import React, { useMemo, useState } from "react";
import {
  Building,
  CalendarRange,
  CreditCard,
  Landmark,
  LayoutDashboard,
  LineChart,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Toaster } from "sonner";
import { WealthProvider, useWealth } from "./contexts/WealthContext";
import { DashboardView } from "./components/DashboardView";
import { CreditCardsView } from "./components/CreditCardsView";
import { InvestmentsHubView } from "./components/InvestmentsHubView";
import { DebtsLoansView } from "./components/DebtsLoansView";
import { TransactionsAccountsView } from "./components/TransactionsAccountsView";
import { BudgetCashflowView } from "./components/BudgetCashflowView";
import { RentalsGoalsView } from "./components/RentalsGoalsView";
import { SettingsVaultView } from "./components/SettingsVaultView";
import {
  enrichVariableAssets,
  evaluateFixedIncomeAsset,
  summarizeDebt,
} from "./lib/finance-engine";
import { brl } from "./lib/format";
import type { NavSectionId } from "./types/wealth";

const NAV_ITEMS: {
  id: NavSectionId;
  label: string;
  badgeText?: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "dashboard",
    label: "Visão Geral",
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    id: "cartoes",
    label: "Cartões & Faturas",
    badgeText: "Faturas",
    icon: <CreditCard className="size-4" />,
  },
  {
    id: "investimentos",
    label: "Investimentos & B3",
    badgeText: "GOOGLEFINANCE",
    icon: <TrendingUp className="size-4" />,
  },
  {
    id: "dividas",
    label: "Financiamentos",
    badgeText: "Baixas",
    icon: <Landmark className="size-4" />,
  },
  {
    id: "lancamentos",
    label: "Caixa & Contas",
    icon: <Wallet className="size-4" />,
  },
  {
    id: "orcamento",
    label: "Orçamento & Folha",
    icon: <CalendarRange className="size-4" />,
  },
  {
    id: "fluxo",
    label: "Fluxo Projetado 12M",
    icon: <LineChart className="size-4" />,
  },
  {
    id: "alugueis",
    label: "Aluguéis & FCI",
    icon: <Building className="size-4" />,
  },
  {
    id: "metas",
    label: "Metas Patrimoniais",
    icon: <Target className="size-4" />,
  },
  {
    id: "config",
    label: "Planilha & Cofre AES",
    icon: <Settings className="size-4" />,
  },
];

function MainWorkspace() {
  const { state, isSyncingSheet, lastSavedAt, syncWithGoogleSheet } = useWealth();
  const [activeTab, setActiveTab] = useState<NavSectionId>("dashboard");

  // Cálculo rápido do Patrimônio Líquido para exibir na barra lateral/topo
  const netWorthSummary = useMemo(() => {
    const cash =
      state.accounts.reduce((s, a) => s + (Number(a.openingBalance) || 0), 0) +
      state.transactions
        .filter((t) => t.status === "realized")
        .reduce((s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)), 0);

    const varMarket = enrichVariableAssets(state.variableAssets, state.dividends).reduce(
      (s, a) => s + a.marketValue,
      0,
    );
    const fixedNet = state.fixedIncome.reduce(
      (s, f) => s + evaluateFixedIncomeAsset(f, state.settings).netToday,
      0,
    );
    const fundsNet = state.funds.reduce((s, f) => s + (Number(f.currentValue) || 0), 0);
    const debtPrincipal = state.debts
      .map(summarizeDebt)
      .reduce((s, d) => s + d.outstandingPrincipal, 0);

    const totalInvestments = varMarket + fixedNet + fundsNet;
    const netWorth = cash + totalInvestments - debtPrincipal;

    return {
      netWorth,
      totalInvestments,
      debtPrincipal,
    };
  }, [state]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 lg:flex-row">
      {/* Sidebar Desktop */}
      <aside className="flex w-full flex-col border-b border-slate-800/80 bg-slate-900/90 lg:w-72 lg: shrink-0 lg:border-b-0 lg:border-r">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-md">
              <Sparkles className="size-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400">
                Private Wealth
              </span>
              <h1 className="font-serif text-base font-bold leading-tight text-slate-100">
                Patrimônio Hub
              </h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <ShieldCheck className="size-3" /> Salvo {lastSavedAt}
          </span>
        </div>

        {/* Resumo Patrimonial Rápido */}
        <div className="border-b border-slate-800/80 bg-slate-950/50 px-5 py-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Patrimônio Líquido Consolidado
          </span>
          <p className="mt-0.5 font-mono text-xl font-bold text-amber-400 tabular-nums">
            {brl(netWorthSummary.netWorth)}
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>Ativos: {brl(netWorthSummary.totalInvestments)}</span>
            <span>Dívidas: {brl(netWorthSummary.debtPrincipal)}</span>
          </div>
        </div>

        {/* Menu de Navegação */}
        <nav className="flex gap-1.5 overflow-x-auto p-3 lg:flex-1 lg:flex-col">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex shrink-0 items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs font-medium transition ${
                  isActive
                    ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.badgeText && (
                  <span
                    className={`hidden rounded-full px-2 py-0.5 text-[9px] font-bold uppercase lg:inline-block ${
                      isActive
                        ? "bg-slate-950/20 text-slate-950"
                        : "bg-slate-800 text-amber-400"
                    }`}
                  >
                    {item.badgeText}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Rodapé da Sidebar com Status de Indexadores & Sync */}
        <div className="hidden border-t border-slate-800/80 p-4 lg:block">
          <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 text-center font-mono text-[11px]">
            <div>
              <span className="block text-[9px] text-slate-400">CDI</span>
              <span className="font-bold text-amber-400">{state.settings.cdiAnnual}%</span>
            </div>
            <div>
              <span className="block text-[9px] text-slate-400">SELIC</span>
              <span className="font-bold text-emerald-400">{state.settings.selicAnnual}%</span>
            </div>
            <div>
              <span className="block text-[9px] text-slate-400">IPCA</span>
              <span className="font-bold text-sky-400">{state.settings.ipcaAnnual}%</span>
            </div>
          </div>
          <button
            onClick={syncWithGoogleSheet}
            disabled={isSyncingSheet}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-400/50 hover:text-amber-300"
          >
            <RefreshCw className={`size-3.5 ${isSyncingSheet ? "animate-spin" : ""}`} />
            Atualizar GOOGLEFINANCE
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">
          {activeTab === "dashboard" && <DashboardView onNavigate={setActiveTab} />}
          {activeTab === "cartoes" && <CreditCardsView />}
          {activeTab === "investimentos" && <InvestmentsHubView />}
          {activeTab === "dividas" && <DebtsLoansView />}
          {activeTab === "lancamentos" && <TransactionsAccountsView />}
          {activeTab === "orcamento" && <BudgetCashflowView key="orc" initialMode="orcamento" />}
          {activeTab === "fluxo" && <BudgetCashflowView key="flx" initialMode="fluxo" />}
          {activeTab === "alugueis" && <RentalsGoalsView key="alg" initialMode="alugueis" />}
          {activeTab === "metas" && <RentalsGoalsView key="mts" initialMode="metas" />}
          {activeTab === "config" && <SettingsVaultView />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WealthProvider>
      <MainWorkspace />
      <Toaster richColors position="bottom-right" theme="dark" />
    </WealthProvider>
  );
}
