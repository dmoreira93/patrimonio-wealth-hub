import React, { useMemo, useState } from "react";
import {
  Building,
  CalendarRange,
  CreditCard,
  Landmark,
  LayoutDashboard,
  LineChart,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { WealthProvider, useWealth } from "./contexts/WealthContext";
import { LoginGate } from "./components/LoginGate";
import { DashboardView } from "./components/DashboardView";
import { CreditCardsView } from "./components/CreditCardsView";
import { InvestmentsHubView } from "./components/InvestmentsHubView";
import { DebtsLoansView } from "./components/DebtsLoansView";
import { TransactionsAccountsView } from "./components/TransactionsAccountsView";
import { BudgetCashflowView } from "./components/BudgetCashflowView";
import { RentalsGoalsView } from "./components/RentalsGoalsView";
import { SettingsVaultView } from "./components/SettingsVaultView";
import {
  clearActiveSession,
  getActiveSessionUser,
  type AuthenticatedUser,
} from "./lib/auth";
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
    badgeText: "Planilha",
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

function MainWorkspace({
  user,
  onLogout,
}: {
  user: AuthenticatedUser;
  onLogout: () => void;
}) {
  const { state, isSyncingSheet, lastSavedAt, syncWithGoogleSheet } = useWealth();
  const [activeTab, setActiveTab] = useState<NavSectionId>("dashboard");

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
    <div className="flex min-h-screen flex-col bg-[#F8FAFC] text-slate-900 lg:flex-row">
      {/* Sidebar Desktop */}
      <aside className="flex w-full flex-col border-b border-slate-200 bg-white lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <Sparkles className="size-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Controle Pessoal
              </span>
              <h1 className="font-serif text-base font-bold leading-tight text-slate-900">
                Patrimônio Hub
              </h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <ShieldCheck className="size-3" /> {lastSavedAt}
          </span>
        </div>

        {/* Usuário Autenticado */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/60 px-5 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <UserCheck className="size-3.5 shrink-0 text-emerald-700" />
            <div className="truncate">
              <p className="truncate text-xs font-semibold text-slate-800">
                {user.displayName}
              </p>
              <p className="truncate font-mono text-[10px] text-slate-500">
                @{user.username}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Bloquear e sair da sessão"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="size-3" />
            Sair
          </button>
        </div>

        {/* Resumo Patrimonial Rápido */}
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Patrimônio Líquido Consolidado
          </span>
          <p className="mt-0.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {brl(netWorthSummary.netWorth)}
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
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
                    ? "bg-slate-900 text-white font-semibold shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.badgeText && (
                  <span
                    className={`hidden rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase lg:inline-block ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
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
        <div className="hidden border-t border-slate-200 p-4 lg:block">
          <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center font-mono text-[11px]">
            <div>
              <span className="block text-[9px] text-slate-500">CDI</span>
              <span className="font-bold text-slate-800">{state.settings.cdiAnnual}%</span>
            </div>
            <div>
              <span className="block text-[9px] text-slate-500">SELIC</span>
              <span className="font-bold text-emerald-700">{state.settings.selicAnnual}%</span>
            </div>
            <div>
              <span className="block text-[9px] text-slate-500">IPCA</span>
              <span className="font-bold text-sky-700">{state.settings.ipcaAnnual}%</span>
            </div>
          </div>
          <button
            onClick={syncWithGoogleSheet}
            disabled={isSyncingSheet}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50"
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
  const [authUser, setAuthUser] = useState<AuthenticatedUser | null>(() =>
    getActiveSessionUser(),
  );

  const handleLogout = () => {
    clearActiveSession();
    setAuthUser(null);
    toast.info("Sessão encerrada com segurança.");
  };

  return (
    <>
      {!authUser ? (
        <LoginGate
          onAuthenticated={(user) => {
            setAuthUser(user);
            toast.success(`Bem-vindo, ${user.displayName}!`);
          }}
        />
      ) : (
        <WealthProvider>
          <MainWorkspace user={authUser} onLogout={handleLogout} />
        </WealthProvider>
      )}
      <Toaster richColors position="bottom-right" theme="light" />
    </>
  );
}
