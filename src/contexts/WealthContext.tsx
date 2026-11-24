import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  AppSettings,
  AssetDividend,
  AssetTrade,
  BankAccount,
  BudgetLineItem,
  CardPurchase,
  Category,
  CreditCard,
  DebtContract,
  FinancialGoal,
  FixedIncomeAsset,
  InvestmentFund,
  RentalContract,
  Transaction,
  VariableAsset,
  WealthState,
} from "../types/wealth";
import { todayIso, uid } from "../lib/format";
import { createInitialSeedState } from "../lib/seed";
import {
  fetchQuotesFromGoogleSheet,
  pushTradeOrTickerToGoogleSheet,
} from "../lib/google-sheets";
import {
  pullWealthStateFromSupabase,
  syncWealthStateToSupabase,
} from "../lib/supabase-sync";

const STORAGE_KEY = "patrimonio_wealth_hub_state_v1";

interface WealthContextValue {
  state: WealthState;
  isSyncingSheet: boolean;
  isSyncingCloud: boolean;
  lastSavedAt: string;

  // Settings & Full State
  updateSettings: (patch: Partial<AppSettings>) => void;
  replaceFullState: (newState: WealthState) => void;
  resetToDemoSeed: () => void;

  // Accounts & Categories
  upsertAccount: (acc: Omit<BankAccount, "id"> & { id?: string }) => void;
  removeAccount: (id: string) => void;
  upsertCategory: (cat: Omit<Category, "id"> & { id?: string }) => void;
  removeCategory: (id: string) => void;

  // Credit Cards & Purchases
  upsertCreditCard: (card: Omit<CreditCard, "id"> & { id?: string }) => void;
  removeCreditCard: (id: string) => void;
  addCardPurchase: (purchase: Omit<CardPurchase, "id" | "paidMonths">) => void;
  removeCardPurchase: (id: string) => void;
  payCardInvoiceMonth: (cardId: string, monthYm: string, accountId?: string) => void;

  // Variable Assets, Trades & Dividends + Google Sheets
  upsertVariableAsset: (asset: Omit<VariableAsset, "id" | "lastUpdated"> & { id?: string }) => void;
  removeVariableAsset: (id: string) => void;
  recordTrade: (
    trade: Omit<AssetTrade, "id" | "syncedToSheet"> & { segment?: string; pvp?: number | null },
  ) => Promise<void>;
  removeTrade: (id: string) => void;
  recordDividend: (div: Omit<AssetDividend, "id">) => void;
  removeDividend: (id: string) => void;
  syncWithGoogleSheet: () => Promise<void>;
  pushAllTickersToGoogleSheet: () => Promise<void>;

  // Fixed Income & Funds
  upsertFixedIncome: (asset: Omit<FixedIncomeAsset, "id"> & { id?: string }) => void;
  removeFixedIncome: (id: string) => void;
  addFixedCoupon: (assetId: string, amount: number, date: string, description?: string) => void;
  upsertFund: (fund: Omit<InvestmentFund, "id" | "lastUpdated"> & { id?: string }) => void;
  removeFund: (id: string) => void;

  // Debts, Installments & Prepayments
  upsertDebt: (debt: Omit<DebtContract, "id" | "payments" | "status"> & { id?: string }) => void;
  removeDebt: (id: string) => void;
  settleDebtInstallment: (
    debtId: string,
    installmentNumber: number,
    paidAmount: number,
    faceAmount: number,
    settlementDate: string,
    isPrepayment?: boolean,
  ) => void;
  undoDebtInstallment: (debtId: string, installmentNumber: number) => void;
  prepayMultipleInstallments: (
    debtId: string,
    installmentNumbers: number[],
    totalPaidAmount: number,
    totalFaceAmount: number,
    settlementDate: string,
  ) => void;

  // Budget, Transactions, Rentals & Goals
  upsertBudgetItem: (item: Omit<BudgetLineItem, "id"> & { id?: string }) => void;
  removeBudgetItem: (id: string) => void;
  upsertTransaction: (tx: Omit<Transaction, "id"> & { id?: string }) => void;
  removeTransaction: (id: string) => void;
  upsertRental: (rental: Omit<RentalContract, "id" | "status"> & { id?: string }) => void;
  removeRental: (id: string) => void;
  registerRentalMonth: (rentalId: string, monthYm: string) => void;
  renewRentalContract: (
    rentalId: string,
    newMonthlyAmount: number,
    effectiveDate: string,
    newEndDate?: string,
  ) => void;
  upsertGoal: (goal: Omit<FinancialGoal, "id"> & { id?: string }) => void;
  removeGoal: (id: string) => void;
  contributeToGoal: (goalId: string, amount: number) => void;

  // Cloud Sync
  pushToSupabaseCloud: () => Promise<void>;
  pullFromSupabaseCloud: () => Promise<void>;
}

const WealthContext = createContext<WealthContextValue | null>(null);

export function WealthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WealthState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WealthState;
        if (parsed && parsed.settings && Array.isArray(parsed.variableAssets)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Falha ao ler estado salvo localmente, usando seed:", e);
    }
    return createInitialSeedState();
  });

  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string>(() =>
    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setLastSavedAt(
        new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      );
    } catch (e) {
      console.error("Falha ao persistir estado no localStorage:", e);
    }
  }, [state]);

  useEffect(() => {
    const html = document.documentElement;
    if (state.settings.theme === "light") {
      html.classList.remove("dark");
      html.classList.add("light");
    } else {
      html.classList.remove("light");
      html.classList.add("dark");
    }
  }, [state.settings.theme]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  };

  const replaceFullState = (newState: WealthState) => {
    setState(newState);
  };

  const resetToDemoSeed = () => {
    const seed = createInitialSeedState();
    setState(seed);
    toast.success("Dados de demonstração recarregados.");
  };

  // Accounts & Categories
  const upsertAccount = (acc: Omit<BankAccount, "id"> & { id?: string }) => {
    setState((prev) => {
      const id = acc.id || uid("acc");
      const exists = prev.accounts.some((a) => a.id === id);
      const next = exists
        ? prev.accounts.map((a) => (a.id === id ? { ...acc, id } : a))
        : [...prev.accounts, { ...acc, id }];
      return { ...prev, accounts: next };
    });
  };

  const removeAccount = (id: string) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((a) => a.id !== id),
    }));
  };

  const upsertCategory = (cat: Omit<Category, "id"> & { id?: string }) => {
    setState((prev) => {
      const id = cat.id || uid("cat");
      const exists = prev.categories.some((c) => c.id === id);
      const next = exists
        ? prev.categories.map((c) => (c.id === id ? { ...cat, id } : c))
        : [...prev.categories, { ...cat, id }];
      return { ...prev, categories: next };
    });
  };

  const removeCategory = (id: string) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c.id !== id),
    }));
  };

  // Credit Cards & Purchases
  const upsertCreditCard = (card: Omit<CreditCard, "id"> & { id?: string }) => {
    setState((prev) => {
      const id = card.id || uid("card");
      const exists = prev.creditCards.some((c) => c.id === id);
      const next = exists
        ? prev.creditCards.map((c) => (c.id === id ? { ...card, id } : c))
        : [...prev.creditCards, { ...card, id }];
      return { ...prev, creditCards: next };
    });
  };

  const removeCreditCard = (id: string) => {
    setState((prev) => ({
      ...prev,
      creditCards: prev.creditCards.filter((c) => c.id !== id),
      cardPurchases: prev.cardPurchases.filter((p) => p.cardId !== id),
    }));
  };

  const addCardPurchase = (purchase: Omit<CardPurchase, "id" | "paidMonths">) => {
    const id = uid("cp");
    setState((prev) => ({
      ...prev,
      cardPurchases: [{ ...purchase, id, paidMonths: [] }, ...prev.cardPurchases],
    }));
  };

  const removeCardPurchase = (id: string) => {
    setState((prev) => ({
      ...prev,
      cardPurchases: prev.cardPurchases.filter((p) => p.id !== id),
      transactions: prev.transactions.filter((t) => t.cardPurchaseId !== id),
    }));
  };

  const payCardInvoiceMonth = (cardId: string, monthYm: string, accountId?: string) => {
    setState((prev) => {
      const card = prev.creditCards.find((c) => c.id === cardId);
      if (!card) return prev;

      let invoiceTotal = 0;
      const updatedPurchases = prev.cardPurchases.map((p) => {
        if (p.cardId !== cardId) return p;
        const paidMonths = new Set(p.paidMonths || []);
        paidMonths.add(monthYm);
        return { ...p, paidMonths: Array.from(paidMonths) };
      });

      // Compute total from purchases in that month
      prev.cardPurchases
        .filter((p) => p.cardId === cardId)
        .forEach((p) => {
          if (p.mode === "single" && p.firstChargeMonth.slice(0, 7) === monthYm) {
            invoiceTotal += p.totalAmount;
          } else if (p.mode === "recurring") {
            invoiceTotal += p.totalAmount;
          } else if (p.mode === "installments") {
            const perInst = p.totalAmount / Math.max(1, p.installmentsTotal);
            invoiceTotal += perInst;
          }
        });

      const dueDay = String(Math.min(28, Math.max(1, card.dueDay))).padStart(2, "0");
      const newTx: Transaction = {
        id: uid("tx_inv"),
        date: `${monthYm}-${dueDay}`,
        description: `Pagamento Fatura ${card.name} (${monthYm})`,
        amount: Number(invoiceTotal.toFixed(2)),
        kind: "expense",
        status: "realized",
        categoryId: "cat_cartao",
        accountId: accountId || prev.accounts[0]?.id,
        cardId,
      };

      return {
        ...prev,
        cardPurchases: updatedPurchases,
        transactions: [newTx, ...prev.transactions],
      };
    });
    toast.success(`Fatura de ${monthYm} baixada como paga!`);
  };

  // Variable Assets, Trades, Dividends & Google Sheets
  const upsertVariableAsset = (
    asset: Omit<VariableAsset, "id" | "lastUpdated"> & { id?: string },
  ) => {
    const ticker = asset.ticker.trim().toUpperCase();
    const today = todayIso();
    setState((prev) => {
      const existing = prev.variableAssets.find(
        (a) => a.id === asset.id || a.ticker.toUpperCase() === ticker,
      );
      if (existing) {
        return {
          ...prev,
          variableAssets: prev.variableAssets.map((a) =>
            a.id === existing.id ? { ...a, ...asset, id: existing.id, ticker, lastUpdated: today } : a,
          ),
        };
      }
      return {
        ...prev,
        variableAssets: [
          ...prev.variableAssets,
          { ...asset, id: uid("va"), ticker, lastUpdated: today },
        ],
      };
    });
  };

  const removeVariableAsset = (id: string) => {
    setState((prev) => ({
      ...prev,
      variableAssets: prev.variableAssets.filter((a) => a.id !== id),
    }));
  };

  const recordTrade = async (
    trade: Omit<AssetTrade, "id" | "syncedToSheet"> & {
      segment?: string;
      pvp?: number | null;
    },
  ) => {
    const ticker = trade.ticker.trim().toUpperCase();
    const qty = Number(trade.quantity) || 0;
    const price = Number(trade.price) || 0;
    const fees = Number(trade.fees) || 0;
    const existing = state.variableAssets.find((a) => a.ticker.toUpperCase() === ticker);

    const currentQty = existing ? existing.quantity : 0;
    const currentAvg = existing ? existing.averagePrice : 0;
    let newQty = currentQty;
    let newAvg = currentAvg;

    if (trade.side === "buy") {
      const totalCost = currentQty * currentAvg + qty * price + fees;
      newQty = currentQty + qty;
      newAvg = newQty > 0 ? totalCost / newQty : price;
    } else {
      newQty = Math.max(0, currentQty - qty);
    }

    let synced = false;
    if (state.settings.b3SheetApiUrl) {
      const res = await pushTradeOrTickerToGoogleSheet(state.settings.b3SheetApiUrl, {
        action: "upsert",
        ticker,
        side: trade.side,
        quantity: qty,
        price,
        tradeDate: trade.tradeDate,
        newQuantity: newQty,
      });
      synced = res.ok;
      if (res.ok) {
        toast.success(`Ordem em ${ticker} sincronizada com a Planilha Google!`);
      } else {
        toast.info(`Ordem salva localmente. (${res.message})`);
      }
    } else {
      toast.success(`Ordem de ${trade.side === "buy" ? "Compra" : "Venda"} em ${ticker} registrada!`);
    }

    const today = todayIso();
    setState((prev) => {
      const found = prev.variableAssets.find((a) => a.ticker.toUpperCase() === ticker);
      const nextAssets = found
        ? prev.variableAssets.map((a) =>
            a.id === found.id
              ? {
                  ...a,
                  quantity: newQty,
                  averagePrice: Number(newAvg.toFixed(4)),
                  currentPrice: a.currentPrice > 0 ? a.currentPrice : price,
                  lastUpdated: today,
                }
              : a,
          )
        : [
            ...prev.variableAssets,
            {
              id: uid("va"),
              ticker,
              name: ticker,
              type: trade.assetType,
              segment: trade.segment || "Geral B3",
              quantity: newQty,
              averagePrice: Number(newAvg.toFixed(4)),
              currentPrice: price,
              dayChangePct: 0,
              pvp: trade.pvp ?? 1.0,
              lastDividendPerShare: 0,
              targetShares: null,
              lastUpdated: today,
            },
          ];

      const newTrade: AssetTrade = {
        id: uid("tr"),
        ticker,
        assetType: trade.assetType,
        side: trade.side,
        quantity: qty,
        price,
        fees,
        tradeDate: trade.tradeDate,
        syncedToSheet: synced,
        notes: trade.notes,
      };

      return {
        ...prev,
        variableAssets: nextAssets,
        trades: [newTrade, ...prev.trades],
      };
    });
  };

  const removeTrade = (id: string) => {
    setState((prev) => ({
      ...prev,
      trades: prev.trades.filter((t) => t.id !== id),
    }));
  };

  const recordDividend = (div: Omit<AssetDividend, "id">) => {
    const ticker = div.ticker.trim().toUpperCase();
    const newDiv: AssetDividend = { ...div, id: uid("div"), ticker };
    setState((prev) => {
      const nextAssets = prev.variableAssets.map((a) => {
        if (a.ticker.toUpperCase() !== ticker) return a;
        const perShare =
          div.perShare && div.perShare > 0
            ? div.perShare
            : a.quantity > 0
              ? Number((div.amount / a.quantity).toFixed(4))
              : a.lastDividendPerShare;
        return {
          ...a,
          lastDividendPerShare: perShare || a.lastDividendPerShare,
        };
      });

      const incomeTx: Transaction = {
        id: uid("tx_div"),
        date: div.payDate,
        description: `${div.type} — ${ticker}`,
        amount: Number(div.amount),
        kind: "income",
        status: "realized",
        categoryId: "cat_dividendos",
        accountId: prev.accounts[0]?.id,
      };

      return {
        ...prev,
        variableAssets: nextAssets,
        dividends: [newDiv, ...prev.dividends],
        transactions: [incomeTx, ...prev.transactions],
      };
    });
    toast.success(`Provento de ${ticker} registrado e somado às receitas!`);
  };

  const removeDividend = (id: string) => {
    setState((prev) => ({
      ...prev,
      dividends: prev.dividends.filter((d) => d.id !== id),
    }));
  };

  const syncWithGoogleSheet = async () => {
    setIsSyncingSheet(true);
    try {
      const res = await fetchQuotesFromGoogleSheet(state.settings.b3SheetApiUrl);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }

      const today = todayIso();
      setState((prev) => {
        const byTicker = new Map(res.rows.map((r) => [r.ticker.toUpperCase(), r]));
        const seen = new Set<string>();

        const updated = prev.variableAssets.map((asset) => {
          const k = asset.ticker.toUpperCase();
          const row = byTicker.get(k);
          if (!row) return asset;
          seen.add(k);
          return {
            ...asset,
            currentPrice: row.price > 0 ? row.price : asset.currentPrice,
            quantity: row.quantity !== null && row.quantity > 0 ? row.quantity : asset.quantity,
            pvp: row.pvp !== null ? row.pvp : asset.pvp,
            segment: row.segment || asset.segment,
            lastDividendPerShare:
              row.lastDividend !== null ? row.lastDividend : asset.lastDividendPerShare,
            targetShares: row.targetShares !== null ? row.targetShares : asset.targetShares,
            dayChangePct: row.dayChangePct !== null ? row.dayChangePct : asset.dayChangePct,
            lastUpdated: today,
          };
        });

        // Also import new tickers from the sheet that were not in variableAssets yet
        const added: VariableAsset[] = [];
        for (const row of res.rows) {
          const k = row.ticker.toUpperCase();
          if (!seen.has(k) && !prev.variableAssets.some((a) => a.ticker.toUpperCase() === k)) {
            added.push({
              id: uid("va"),
              ticker: k,
              name: k,
              type: k.endsWith("11") ? "FII" : "Ação",
              segment: row.segment || "Planilha Google",
              quantity: row.quantity ?? 0,
              averagePrice: row.price,
              currentPrice: row.price,
              dayChangePct: row.dayChangePct ?? 0,
              pvp: row.pvp,
              lastDividendPerShare: row.lastDividend ?? 0,
              targetShares: row.targetShares,
              lastUpdated: today,
            });
          }
        }

        return {
          ...prev,
          variableAssets: [...updated, ...added],
        };
      });

      toast.success(res.message);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const pushAllTickersToGoogleSheet = async () => {
    if (!state.settings.b3SheetApiUrl) {
      toast.error("Configure a URL do Google Apps Script em Configurações.");
      return;
    }
    setIsSyncingSheet(true);
    try {
      let okCount = 0;
      for (const asset of state.variableAssets) {
        const res = await pushTradeOrTickerToGoogleSheet(state.settings.b3SheetApiUrl, {
          action: "upsert",
          ticker: asset.ticker,
          side: "buy",
          quantity: asset.quantity,
          price: asset.averagePrice,
          tradeDate: todayIso(),
          newQuantity: asset.quantity,
        });
        if (res.ok) okCount++;
      }
      toast.success(`${okCount} ativo(s) enviados para a Planilha Google!`);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Fixed Income & Funds
  const upsertFixedIncome = (asset: Omit<FixedIncomeAsset, "id"> & { id?: string }) => {
    setState((prev) => {
      const id = asset.id || uid("fix");
      const exists = prev.fixedIncome.some((f) => f.id === id);
      const next = exists
        ? prev.fixedIncome.map((f) => (f.id === id ? { ...asset, id } : f))
        : [...prev.fixedIncome, { ...asset, id }];
      return { ...prev, fixedIncome: next };
    });
  };

  const removeFixedIncome = (id: string) => {
    setState((prev) => ({
      ...prev,
      fixedIncome: prev.fixedIncome.filter((f) => f.id !== id),
    }));
  };

  const addFixedCoupon = (
    assetId: string,
    amount: number,
    date: string,
    description?: string,
  ) => {
    setState((prev) => ({
      ...prev,
      fixedIncome: prev.fixedIncome.map((f) =>
        f.id === assetId
          ? {
              ...f,
              coupons: [
                ...(f.coupons || []),
                { id: uid("coup"), amount, date, description },
              ],
            }
          : f,
      ),
    }));
    toast.success("Cupom / rendimento registrado no título!");
  };

  const upsertFund = (fund: Omit<InvestmentFund, "id" | "lastUpdated"> & { id?: string }) => {
    const today = todayIso();
    setState((prev) => {
      const id = fund.id || uid("fund");
      const exists = prev.funds.some((f) => f.id === id);
      const next = exists
        ? prev.funds.map((f) =>
            f.id === id
              ? {
                  ...f,
                  ...fund,
                  id,
                  lastUpdated: today,
                  valueHistory: [
                    ...(f.valueHistory || []),
                    { date: today, value: fund.currentValue },
                  ],
                }
              : f,
          )
        : [
            ...prev.funds,
            {
              ...fund,
              id,
              lastUpdated: today,
              valueHistory: [{ date: today, value: fund.currentValue }],
            },
          ];
      return { ...prev, funds: next };
    });
  };

  const removeFund = (id: string) => {
    setState((prev) => ({
      ...prev,
      funds: prev.funds.filter((f) => f.id !== id),
    }));
  };

  // Debts, Installments & Prepayments
  const upsertDebt = (
    debt: Omit<DebtContract, "id" | "payments" | "status"> & { id?: string },
  ) => {
    setState((prev) => {
      const id = debt.id || uid("debt");
      const existing = prev.debts.find((d) => d.id === id);
      const nextDebt: DebtContract = {
        ...debt,
        id,
        payments: existing?.payments || {},
        status: existing?.status || "active",
      };
      const next = existing
        ? prev.debts.map((d) => (d.id === id ? nextDebt : d))
        : [nextDebt, ...prev.debts];
      return { ...prev, debts: next };
    });
  };

  const removeDebt = (id: string) => {
    setState((prev) => ({
      ...prev,
      debts: prev.debts.filter((d) => d.id !== id),
      transactions: prev.transactions.filter((t) => t.debtId !== id),
    }));
  };

  const settleDebtInstallment = (
    debtId: string,
    installmentNumber: number,
    paidAmount: number,
    faceAmount: number,
    settlementDate: string,
    isPrepayment = false,
  ) => {
    const txId = uid("tx_debt");
    setState((prev) => {
      const debt = prev.debts.find((d) => d.id === debtId);
      if (!debt) return prev;

      const discount = Math.max(0, faceAmount - paidAmount);
      const nextPayments = {
        ...(debt.payments || {}),
        [installmentNumber]: {
          installmentNumber,
          settlementDate,
          paidAmount,
          faceAmount,
          discount,
          isPrepayment,
          transactionId: txId,
        },
      };

      const allPaid = Object.keys(nextPayments).length >= debt.installmentsTotal;
      const nextDebts = prev.debts.map((d) =>
        d.id === debtId
          ? {
              ...d,
              payments: nextPayments,
              status: (allPaid ? "paid" : "active") as DebtContract["status"],
            }
          : d,
      );

      const newTx: Transaction = {
        id: txId,
        date: settlementDate,
        description: `${isPrepayment ? "Antecipação" : "Baixa"} ${debt.name} — Parcela ${installmentNumber}/${debt.installmentsTotal}`,
        amount: Number(paidAmount.toFixed(2)),
        kind: "expense",
        status: "realized",
        categoryId: debt.categoryId || "cat_financiamento",
        debtId,
        debtInstallmentNumber: installmentNumber,
      };

      return {
        ...prev,
        debts: nextDebts,
        transactions: [newTx, ...prev.transactions],
      };
    });
    toast.success(`Parcela #${installmentNumber} baixada com sucesso!`);
  };

  const undoDebtInstallment = (debtId: string, installmentNumber: number) => {
    setState((prev) => {
      const debt = prev.debts.find((d) => d.id === debtId);
      if (!debt) return prev;
      const payment = debt.payments?.[installmentNumber];
      const nextPayments = { ...(debt.payments || {}) };
      delete nextPayments[installmentNumber];

      return {
        ...prev,
        debts: prev.debts.map((d) =>
          d.id === debtId ? { ...d, payments: nextPayments, status: "active" } : d,
        ),
        transactions: prev.transactions.filter(
          (t) =>
            t.id !== payment?.transactionId &&
            !(t.debtId === debtId && t.debtInstallmentNumber === installmentNumber),
        ),
      };
    });
    toast.info(`Baixa da parcela #${installmentNumber} desfeita.`);
  };

  const prepayMultipleInstallments = (
    debtId: string,
    installmentNumbers: number[],
    totalPaidAmount: number,
    totalFaceAmount: number,
    settlementDate: string,
  ) => {
    if (installmentNumbers.length === 0) return;
    const txId = uid("tx_prepay");
    setState((prev) => {
      const debt = prev.debts.find((d) => d.id === debtId);
      if (!debt) return prev;

      const count = installmentNumbers.length;
      const perPaid = totalPaidAmount / count;
      const perFace = totalFaceAmount / count;
      const perDiscount = Math.max(0, perFace - perPaid);

      const nextPayments = { ...(debt.payments || {}) };
      for (const n of installmentNumbers) {
        nextPayments[n] = {
          installmentNumber: n,
          settlementDate,
          paidAmount: Number(perPaid.toFixed(2)),
          faceAmount: Number(perFace.toFixed(2)),
          discount: Number(perDiscount.toFixed(2)),
          isPrepayment: true,
          transactionId: txId,
        };
      }

      const allPaid = Object.keys(nextPayments).length >= debt.installmentsTotal;
      const newTx: Transaction = {
        id: txId,
        date: settlementDate,
        description: `Antecipação ${debt.name} (Parcelas ${installmentNumbers.join(", ")})`,
        amount: Number(totalPaidAmount.toFixed(2)),
        kind: "expense",
        status: "realized",
        categoryId: debt.categoryId || "cat_financiamento",
        debtId,
      };

      return {
        ...prev,
        debts: prev.debts.map((d) =>
          d.id === debtId
            ? {
                ...d,
                payments: nextPayments,
                status: (allPaid ? "paid" : "active") as DebtContract["status"],
              }
            : d,
        ),
        transactions: [newTx, ...prev.transactions],
      };
    });
  };

  // Budget, Transactions, Rentals & Goals
  const upsertBudgetItem = (item: Omit<BudgetLineItem, "id"> & { id?: string }) => {
    setState((prev) => {
      const id = item.id || uid("b");
      const exists = prev.budgetItems.some((b) => b.id === id);
      const next = exists
        ? prev.budgetItems.map((b) => (b.id === id ? { ...item, id } : b))
        : [...prev.budgetItems, { ...item, id }];
      return { ...prev, budgetItems: next };
    });
  };

  const removeBudgetItem = (id: string) => {
    setState((prev) => ({
      ...prev,
      budgetItems: prev.budgetItems.filter((b) => b.id !== id),
    }));
  };

  const upsertTransaction = (tx: Omit<Transaction, "id"> & { id?: string }) => {
    setState((prev) => {
      const id = tx.id || uid("tx");
      const exists = prev.transactions.some((t) => t.id === id);
      const next = exists
        ? prev.transactions.map((t) => (t.id === id ? { ...tx, id } : t))
        : [{ ...tx, id }, ...prev.transactions];
      return { ...prev, transactions: next };
    });
  };

  const removeTransaction = (id: string) => {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== id),
    }));
  };

  const upsertRental = (rental: Omit<RentalContract, "id" | "status"> & { id?: string }) => {
    setState((prev) => {
      const id = rental.id || uid("rent");
      const exists = prev.rentals.some((r) => r.id === id);
      const next = exists
        ? prev.rentals.map((r) => (r.id === id ? { ...rental, id, status: r.status } : r))
        : [...prev.rentals, { ...rental, id, status: "active" as const }];
      return { ...prev, rentals: next };
    });
  };

  const removeRental = (id: string) => {
    setState((prev) => ({
      ...prev,
      rentals: prev.rentals.filter((r) => r.id !== id),
    }));
  };

  const registerRentalMonth = (rentalId: string, monthYm: string) => {
    setState((prev) => {
      const rental = prev.rentals.find((r) => r.id === rentalId);
      if (!rental) return prev;
      const fci = rental.monthlyAmount * ((rental.fciPercent || 0) / 100);
      const dueDay = String(Math.min(28, Math.max(1, rental.dueDay))).padStart(2, "0");
      const date = `${monthYm}-${dueDay}`;

      const tx: Transaction = {
        id: uid("tx_rent"),
        date,
        description: `Aluguel — ${rental.propertyName}`,
        amount: rental.role === "tenant" ? rental.monthlyAmount + fci : rental.monthlyAmount,
        kind: rental.role === "landlord" ? "income" : "expense",
        status: "realized",
        categoryId:
          rental.categoryId ||
          (rental.role === "landlord" ? "cat_aluguel_rec" : "cat_moradia"),
        rentalId: rental.id,
      };

      const nextFci =
        fci > 0
          ? [
              {
                id: uid("fci"),
                rentalId: rental.id,
                referenceMonth: monthYm,
                amount: fci,
                paidDate: date,
              },
              ...prev.rentalFciEntries,
            ]
          : prev.rentalFciEntries;

      return {
        ...prev,
        transactions: [tx, ...prev.transactions],
        rentalFciEntries: nextFci,
      };
    });
    toast.success("Aluguel e FCI do mês registrados!");
  };

  const renewRentalContract = (
    rentalId: string,
    newMonthlyAmount: number,
    effectiveDate: string,
    newEndDate?: string,
  ) => {
    setState((prev) => {
      const rental = prev.rentals.find((r) => r.id === rentalId);
      if (!rental) return prev;

      return {
        ...prev,
        rentals: prev.rentals.map((r) =>
          r.id === rentalId
            ? {
                ...r,
                monthlyAmount: newMonthlyAmount,
                endDate: newEndDate || r.endDate,
              }
            : r,
        ),
        rentalRenewals: [
          {
            id: uid("ren"),
            rentalId,
            previousAmount: rental.monthlyAmount,
            newAmount: newMonthlyAmount,
            fciPercent: rental.fciPercent,
            effectiveDate,
            newEndDate,
          },
          ...prev.rentalRenewals,
        ],
      };
    });
    toast.success("Contrato de aluguel reajustado/renovado!");
  };

  const upsertGoal = (goal: Omit<FinancialGoal, "id"> & { id?: string }) => {
    setState((prev) => {
      const id = goal.id || uid("goal");
      const exists = prev.goals.some((g) => g.id === id);
      const next = exists
        ? prev.goals.map((g) => (g.id === id ? { ...goal, id } : g))
        : [...prev.goals, { ...goal, id }];
      return { ...prev, goals: next };
    });
  };

  const removeGoal = (id: string) => {
    setState((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== id),
    }));
  };

  const contributeToGoal = (goalId: string, amount: number) => {
    setState((prev) => ({
      ...prev,
      goals: prev.goals.map((g) =>
        g.id === goalId ? { ...g, currentAmount: g.currentAmount + amount } : g,
      ),
    }));
    toast.success("Aporte adicionado à meta!");
  };

  const pushToSupabaseCloud = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await syncWealthStateToSupabase(state);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const pullFromSupabaseCloud = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await pullWealthStateFromSupabase(
        state.settings.supabaseUrl,
        state.settings.supabaseAnonKey,
      );
      if (res.ok && res.state) {
        setState(res.state);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setIsSyncingCloud(false);
    }
  };

  return (
    <WealthContext.Provider
      value={{
        state,
        isSyncingSheet,
        isSyncingCloud,
        lastSavedAt,
        updateSettings,
        replaceFullState,
        resetToDemoSeed,
        upsertAccount,
        removeAccount,
        upsertCategory,
        removeCategory,
        upsertCreditCard,
        removeCreditCard,
        addCardPurchase,
        removeCardPurchase,
        payCardInvoiceMonth,
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
        addFixedCoupon,
        upsertFund,
        removeFund,
        upsertDebt,
        removeDebt,
        settleDebtInstallment,
        undoDebtInstallment,
        prepayMultipleInstallments,
        upsertBudgetItem,
        removeBudgetItem,
        upsertTransaction,
        removeTransaction,
        upsertRental,
        removeRental,
        registerRentalMonth,
        renewRentalContract,
        upsertGoal,
        removeGoal,
        contributeToGoal,
        pushToSupabaseCloud,
        pullFromSupabaseCloud,
      }}
    >
      {children}
    </WealthContext.Provider>
  );
}

export function useWealth() {
  const ctx = useContext(WealthContext);
  if (!ctx) throw new Error("useWealth must be used inside WealthProvider");
  return ctx;
}
