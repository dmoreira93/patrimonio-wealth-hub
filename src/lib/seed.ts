import type { WealthState } from "../types/wealth";
import { currentMonthIso } from "./format";

/**
 * Estado inicial limpo (sem dados fictícios), mantendo apenas as categorias
 * padrão do orçamento (com valores zerados) e parâmetros macroeconômicos de referência.
 */
export function createInitialSeedState(): WealthState {
  const ym = currentMonthIso();
  const year = Number(ym.slice(0, 4)) || 2026;

  return {
    settings: {
      referenceYear: year,
      cdiAnnual: 11.15,
      selicAnnual: 11.25,
      ipcaAnnual: 4.5,
      ipcaMonth: 5,
      igpmAnnual: 3.9,
      igpmMonth: 7,
      b3SheetApiUrl: "",
      googleSpreadsheetUrl: "",
      supabaseUrl: "",
      supabaseAnonKey: "",
      githubToken: "",
      githubRepo: "",
      githubPath: "patrimonio-wealth-backup.json",
      theme: "light",
    },

    accounts: [],

    categories: [
      {
        id: "cat_salario",
        name: "Salário & Pró-Labore",
        kind: "income",
        group: "Renda Principal",
        color: "#059669",
        monthlyBudget: 0,
      },
      {
        id: "cat_aluguel_rec",
        name: "Receita de Aluguéis",
        kind: "income",
        group: "Renda Passiva",
        color: "#10B981",
        monthlyBudget: 0,
      },
      {
        id: "cat_dividendos",
        name: "Dividendos & Proventos",
        kind: "income",
        group: "Renda Passiva",
        color: "#334155",
        monthlyBudget: 0,
      },
      {
        id: "cat_moradia",
        name: "Moradia & Condomínio",
        kind: "expense",
        group: "Essenciais",
        color: "#0284C7",
        monthlyBudget: 0,
      },
      {
        id: "cat_alimentacao",
        name: "Supermercado & Alimentação",
        kind: "expense",
        group: "Essenciais",
        color: "#D97706",
        monthlyBudget: 0,
      },
      {
        id: "cat_cartao",
        name: "Cartão de Crédito",
        kind: "expense",
        group: "Estilo de Vida",
        color: "#4F46E5",
        monthlyBudget: 0,
      },
      {
        id: "cat_financiamento",
        name: "Financiamentos & Empréstimos",
        kind: "expense",
        group: "Compromissos",
        color: "#E11D48",
        monthlyBudget: 0,
      },
      {
        id: "cat_transporte",
        name: "Mobilidade & Combustível",
        kind: "expense",
        group: "Essenciais",
        color: "#2563EB",
        monthlyBudget: 0,
      },
      {
        id: "cat_lazer",
        name: "Saúde, Educação & Lazer",
        kind: "expense",
        group: "Estilo de Vida",
        color: "#7C3AED",
        monthlyBudget: 0,
      },
    ],

    budgetItems: [],
    creditCards: [],
    cardPurchases: [],
    transactions: [],
    variableAssets: [],
    trades: [],
    dividends: [],
    fixedIncome: [],
    funds: [],
    debts: [],
    rentals: [],
    rentalFciEntries: [],
    rentalRenewals: [],
    goals: [],
  };
}
