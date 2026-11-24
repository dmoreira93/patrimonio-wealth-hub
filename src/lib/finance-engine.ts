import type {
  AppSettings,
  AssetDividend,
  AssetTrade,
  BudgetLineItem,
  CardPurchase,
  CreditCard,
  DebtContract,
  FixedIncomeAsset,
  FixedIncomeType,
  RentalContract,
  VariableAsset,
} from "../types/wealth";
import { addMonthsIso, daysBetween, monthsBetweenIso, todayIso } from "./format";

/* ============================================================================
 * 1. PRECISÃO DE CENTAVOS & CARTÕES DE CRÉDITO
 * ============================================================================ */

/**
 * Divide um valor total em `n` parcelas sem perda ou sobra de centavos.
 * A soma de todos os elementos do array retornado é exatamente igual a `total`.
 */
export function splitInstallmentsExact(total: number, n: number): number[] {
  const count = Math.max(1, Math.round(n) || 1);
  const cents = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(cents / count);
  const rem = cents - base * count;
  const arr: number[] = [];
  for (let i = 0; i < count; i++) {
    arr.push((base + (i < rem ? 1 : 0)) / 100);
  }
  return arr;
}

/**
 * Determina o mês de cobrança inicial (YYYY-MM) de uma compra no cartão
 * com base na data da compra e no dia de fechamento do cartão.
 */
export function suggestFirstInvoiceMonth(purchaseDateIso: string, closingDay: number): string {
  const parts = purchaseDateIso.slice(0, 10).split("-").map(Number);
  const y = parts[0] || new Date().getFullYear();
  const m = parts[1] || new Date().getMonth() + 1;
  const d = parts[2] || 1;
  const baseYm = `${y}-${String(m).padStart(2, "0")}`;
  if (d >= closingDay) {
    return addMonthsIso(baseYm, 1);
  }
  return baseYm;
}

export interface CardInvoiceEntry {
  purchaseId: string;
  cardId: string;
  description: string;
  categoryId: string;
  purchaseDate: string;
  month: string; // YYYY-MM
  installmentNumber: number;
  installmentsTotal: number;
  amount: number;
  mode: CardPurchase["mode"];
  isPaid: boolean;
}

/**
 * Expande uma compra de cartão em suas parcelas mensais correspondentes.
 */
export function expandCardPurchaseSchedule(purchase: CardPurchase): CardInvoiceEntry[] {
  const paidSet = new Set(purchase.paidMonths || []);

  if (purchase.mode === "single") {
    return [
      {
        purchaseId: purchase.id,
        cardId: purchase.cardId,
        description: purchase.description,
        categoryId: purchase.categoryId,
        purchaseDate: purchase.purchaseDate,
        month: purchase.firstChargeMonth.slice(0, 7),
        installmentNumber: 1,
        installmentsTotal: 1,
        amount: Number(purchase.totalAmount) || 0,
        mode: "single",
        isPaid: paidSet.has(purchase.firstChargeMonth.slice(0, 7)),
      },
    ];
  }

  if (purchase.mode === "recurring") {
    const monthsCount = Math.max(1, Number(purchase.installmentsTotal) || 12);
    const list: CardInvoiceEntry[] = [];
    for (let i = 0; i < monthsCount; i++) {
      const m = addMonthsIso(purchase.firstChargeMonth, i);
      list.push({
        purchaseId: purchase.id,
        cardId: purchase.cardId,
        description: `${purchase.description} (Assinatura)`,
        categoryId: purchase.categoryId,
        purchaseDate: purchase.purchaseDate,
        month: m,
        installmentNumber: i + 1,
        installmentsTotal: monthsCount,
        amount: Number(purchase.totalAmount) || 0,
        mode: "recurring",
        isPaid: paidSet.has(m),
      });
    }
    return list;
  }

  // Parcelada (installments)
  const n = Math.max(1, Number(purchase.installmentsTotal) || 1);
  const startInst = Math.max(1, Math.min(n, Number(purchase.currentInstallment) || 1));
  const values = splitInstallmentsExact(purchase.totalAmount, n);
  const list: CardInvoiceEntry[] = [];

  for (let instNum = startInst; instNum <= n; instNum++) {
    const offset = instNum - 1;
    const m = addMonthsIso(purchase.firstChargeMonth, offset);
    list.push({
      purchaseId: purchase.id,
      cardId: purchase.cardId,
      description: `${purchase.description} (${instNum}/${n})`,
      categoryId: purchase.categoryId,
      purchaseDate: purchase.purchaseDate,
      month: m,
      installmentNumber: instNum,
      installmentsTotal: n,
      amount: values[instNum - 1] ?? 0,
      mode: "installments",
      isPaid: paidSet.has(m),
    });
  }
  return list;
}

export function getCardUsedLimit(card: CreditCard, purchases: CardPurchase[], refMonth: string): number {
  return purchases
    .filter((p) => p.cardId === card.id)
    .flatMap(expandCardPurchaseSchedule)
    .filter((entry) => entry.month >= refMonth && !entry.isPaid)
    .reduce((sum, entry) => (entry.mode === "recurring" ? sum : sum + entry.amount), 0);
}

/* ============================================================================
 * 2. FINANCIAMENTOS, EMPRÉSTIMOS E AMORTIZAÇÃO (PRICE, SAC, FIXO)
 * ============================================================================ */

/** Prestação constante pelo Sistema Francês de Amortização (Tabela Price). */
export function calculatePmt(principal: number, monthlyRateDecimal: number, months: number): number {
  if (months <= 0) return 0;
  if (monthlyRateDecimal <= 0) return principal / months;
  const factor = Math.pow(1 + monthlyRateDecimal, months);
  return (principal * monthlyRateDecimal * factor) / (factor - 1);
}

export interface DebtScheduleRow {
  n: number;
  month: string; // YYYY-MM
  dueDate: string; // YYYY-MM-DD
  installment: number;
  interest: number;
  principalAmortized: number;
  remainingBalance: number;
  isPaid: boolean;
  isPrepaid: boolean;
  paidDate: string | null;
  paidAmount: number | null;
  discountObtained: number;
}

/**
 * Gera a tabela completa de evolução e amortização de um financiamento/empréstimo
 * suportando Price, SAC ou Parcelas Fixas, integrando baixas e antecipações com desconto.
 */
export function buildDebtSchedule(debt: DebtContract): DebtScheduleRow[] {
  const total = Math.max(1, Number(debt.installmentsTotal) || 1);
  const rate = Math.max(0, (Number(debt.interestRateMonthly) || 0) / 100);
  const principal = Math.max(0, Number(debt.principal) || 0);
  const startYm = debt.startDate.slice(0, 7);
  const dueDay = String(Math.min(28, Math.max(1, Number(debt.dueDay) || 10))).padStart(2, "0");

  const rows: DebtScheduleRow[] = [];
  let balance = principal;

  const pricePmt =
    debt.amortizationSystem === "fixed" && debt.installmentAmount
      ? Number(debt.installmentAmount)
      : calculatePmt(principal, rate, total);

  const sacAmort = total > 0 ? principal / total : 0;

  for (let n = 1; n <= total; n++) {
    const month = addMonthsIso(startYm, n - 1);
    const dueDate = `${month}-${dueDay}`;
    let interest = balance * rate;
    let installment = pricePmt;
    let amort = 0;

    if (debt.amortizationSystem === "sac") {
      amort = Math.min(sacAmort, balance);
      installment = amort + interest;
    } else if (debt.amortizationSystem === "fixed" && debt.installmentAmount) {
      installment = Number(debt.installmentAmount);
      amort = Math.min(Math.max(installment - interest, principal / total), balance);
      interest = Math.max(0, installment - amort);
    } else {
      // Price
      amort = Math.min(Math.max(installment - interest, 0), balance);
    }

    balance = Math.max(0, balance - amort);

    const payment = (debt.payments || {})[n];
    const isPaid = !!payment;

    rows.push({
      n,
      month,
      dueDate,
      installment,
      interest,
      principalAmortized: amort,
      remainingBalance: balance,
      isPaid,
      isPrepaid: !!payment?.isPrepayment,
      paidDate: payment?.settlementDate ?? null,
      paidAmount: payment ? payment.paidAmount : null,
      discountObtained: payment ? payment.discount : 0,
    });
  }

  return rows;
}

export function summarizeDebt(debt: DebtContract) {
  const schedule = buildDebtSchedule(debt);
  const openRows = schedule.filter((r) => !r.isPaid);
  const paidRows = schedule.filter((r) => r.isPaid);

  const outstandingPrincipal = openRows.reduce((s, r) => s + r.principalAmortized, 0);
  const openFaceTotal = openRows.reduce((s, r) => s + r.installment, 0);
  const totalPaid = paidRows.reduce((s, r) => s + (r.paidAmount ?? r.installment), 0);
  const totalDiscount = paidRows.reduce((s, r) => s + (r.discountObtained || 0), 0);
  const nextOpen = openRows[0] ?? null;

  return {
    schedule,
    openCount: openRows.length,
    paidCount: paidRows.length,
    totalCount: schedule.length,
    progressPct: schedule.length > 0 ? (paidRows.length / schedule.length) * 100 : 0,
    outstandingPrincipal,
    openFaceTotal,
    totalPaid,
    totalDiscount,
    nextOpen,
    currentInstallmentValue: nextOpen ? nextOpen.installment : (schedule[0]?.installment ?? 0),
  };
}

/* ============================================================================
 * 3. RENDA VARIÁVEL (AÇÕES, FIIs, BDRs, ETFs) & NÚMERO MÁGICO
 * ============================================================================ */

export interface TickerComputedStats {
  ticker: string;
  quantityFromTrades: number;
  averagePriceFromTrades: number;
  investedCost: number;
  realizedPnl: number;
  totalFees: number;
}

export function computeStatsFromTrades(trades: AssetTrade[]): Map<string, TickerComputedStats> {
  const map = new Map<string, TickerComputedStats>();
  const sorted = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

  for (const t of sorted) {
    const ticker = t.ticker.trim().toUpperCase();
    const cur = map.get(ticker) ?? {
      ticker,
      quantityFromTrades: 0,
      averagePriceFromTrades: 0,
      investedCost: 0,
      realizedPnl: 0,
      totalFees: 0,
    };

    const qty = Number(t.quantity) || 0;
    const price = Number(t.price) || 0;
    const fees = Number(t.fees) || 0;
    cur.totalFees += fees;

    if (t.side === "buy") {
      cur.investedCost += qty * price + fees;
      cur.quantityFromTrades += qty;
      cur.averagePriceFromTrades =
        cur.quantityFromTrades > 0 ? cur.investedCost / cur.quantityFromTrades : 0;
    } else {
      const sold = Math.min(qty, cur.quantityFromTrades);
      const costRemoved = sold * cur.averagePriceFromTrades;
      cur.realizedPnl += sold * price - costRemoved - fees;
      cur.investedCost = Math.max(0, cur.investedCost - costRemoved);
      cur.quantityFromTrades = Math.max(0, cur.quantityFromTrades - sold);
      if (cur.quantityFromTrades === 0) cur.investedCost = 0;
    }

    map.set(ticker, cur);
  }

  return map;
}

export interface EnrichedVariableAsset extends VariableAsset {
  investedTotal: number;
  marketValue: number;
  capitalGain: number;
  capitalGainPct: number;
  dividendsReceived: number;
  totalReturn: number; // Valorização + Dividendos recebidos
  totalReturnPct: number;
  monthlyDyPct: number;
  yocPct: number;
  magicNumber: number;
  magicMissingShares: number;
  magicMissingCost: number;
  magicProgressPct: number;
  estimatedMonthlyPassiveIncome: number;
  buyScore: number;
}

export function enrichVariableAssets(
  assets: VariableAsset[],
  dividends: AssetDividend[],
): EnrichedVariableAsset[] {
  const divByTicker = new Map<string, number>();
  for (const d of dividends) {
    const k = d.ticker.trim().toUpperCase();
    divByTicker.set(k, (divByTicker.get(k) ?? 0) + (Number(d.amount) || 0));
  }

  const prelim = assets.map((a) => {
    const ticker = a.ticker.trim().toUpperCase();
    const qty = Number(a.quantity) || 0;
    const avg = Number(a.averagePrice) || 0;
    const price = Number(a.currentPrice) || 0;
    const investedTotal = qty * avg;
    const marketValue = qty * price;
    const capitalGain = marketValue - investedTotal;
    const capitalGainPct = investedTotal > 0 ? (capitalGain / investedTotal) * 100 : 0;
    const dividendsReceived = divByTicker.get(ticker) ?? 0;
    const totalReturn = capitalGain + dividendsReceived;
    const totalReturnPct = investedTotal > 0 ? (totalReturn / investedTotal) * 100 : 0;

    const lastDiv = Number(a.lastDividendPerShare) || 0;
    const monthlyDyPct = price > 0 && lastDiv > 0 ? (lastDiv / price) * 100 : 0;
    const yocPct = avg > 0 && lastDiv > 0 ? (lastDiv / avg) * 100 : 0;

    const magicNumber = price > 0 && lastDiv > 0 ? Math.ceil(price / lastDiv) : 0;
    const magicMissingShares = magicNumber > 0 ? Math.max(0, magicNumber - qty) : 0;
    const magicMissingCost = magicMissingShares * price;
    const magicProgressPct =
      magicNumber > 0 ? Math.min(100, (qty / magicNumber) * 100) : 0;
    const estimatedMonthlyPassiveIncome = qty * lastDiv;

    return {
      ...a,
      investedTotal,
      marketValue,
      capitalGain,
      capitalGainPct,
      dividendsReceived,
      totalReturn,
      totalReturnPct,
      monthlyDyPct,
      yocPct,
      magicNumber,
      magicMissingShares,
      magicMissingCost,
      magicProgressPct,
      estimatedMonthlyPassiveIncome,
      buyScore: 0,
    };
  });

  const maxDy = Math.max(...prelim.map((x) => x.monthlyDyPct), 0.01);
  for (const item of prelim) {
    const discountScore =
      item.pvp && item.pvp > 0 ? Math.max(0, Math.min(1, (1.2 - item.pvp) / 0.4)) : 0.35;
    const dyScore = Math.min(1, item.monthlyDyPct / maxDy);
    const magicScore = item.magicProgressPct / 100;
    item.buyScore = Math.round((discountScore * 0.45 + dyScore * 0.35 + magicScore * 0.2) * 100);
  }

  return prelim;
}

/* ============================================================================
 * 4. RENDA FIXA & TESOURO DIRETO (CURVA + TABELA REGRESSIVA DE IR)
 * ============================================================================ */

export const TAX_EXEMPT_FIXED_TYPES: FixedIncomeType[] = ["LCI", "LCA", "CRI", "CRA"];

export function isFixedTypeTaxExempt(type: FixedIncomeType): boolean {
  return TAX_EXEMPT_FIXED_TYPES.includes(type);
}

/** Alíquota regressiva de Imposto de Renda da Renda Fixa Brasileira */
export function fixedIncomeIrRate(daysElapsed: number): number {
  if (daysElapsed <= 180) return 0.225;
  if (daysElapsed <= 360) return 0.2;
  if (daysElapsed <= 720) return 0.175;
  return 0.15;
}

/** Taxa efetiva anual (decimal) de um título de Renda Fixa com base nos indexadores atuais */
export function fixedEffectiveAnnualRate(asset: FixedIncomeAsset, settings: AppSettings): number {
  const rv = Number(asset.rateValue) || 0;
  if (asset.rateType === "pre") return rv / 100;
  if (asset.rateType === "posCDI") return ((Number(settings.cdiAnnual) || 0) / 100) * (rv / 100);
  if (asset.rateType === "posSelic") return ((Number(settings.selicAnnual) || 0) / 100) * (rv / 100);
  if (asset.rateType === "ipcaMais") {
    const ipca = (Number(settings.ipcaAnnual) || 0) / 100;
    const spread = rv / 100;
    return (1 + ipca) * (1 + spread) - 1;
  }
  return 0;
}

export function formatFixedRateLabel(asset: FixedIncomeAsset): string {
  if (asset.rateType === "posCDI") return `${asset.rateValue}% do CDI`;
  if (asset.rateType === "posSelic") return `${asset.rateValue}% da SELIC`;
  if (asset.rateType === "ipcaMais") return `IPCA + ${asset.rateValue}% a.a.`;
  return `${asset.rateValue}% a.a. Pré`;
}

export function evaluateFixedIncomeAsset(
  asset: FixedIncomeAsset,
  settings: AppSettings,
  asOfIso: string = todayIso(),
) {
  const principal = Number(asset.principal) || 0;
  const annualRate = fixedEffectiveAnnualRate(asset, settings);
  const daysNow = daysBetween(asset.applicationDate, asOfIso);
  const yearsNow = daysNow / 365;

  const grossToday = principal * Math.pow(1 + annualRate, Math.max(0, yearsNow));
  const gainToday = Math.max(0, grossToday - principal);
  const exempt = asset.taxExempt || isFixedTypeTaxExempt(asset.type);
  const irRateToday = exempt ? 0 : fixedIncomeIrRate(daysNow);
  const taxToday = gainToday * irRateToday;
  const netToday = grossToday - taxToday;

  // Projeção no vencimento (ou +12 meses se liquidez diária sem vencimento)
  const targetIso =
    !asset.noMaturity && asset.maturityDate
      ? asset.maturityDate
      : `${addMonthsIso(asOfIso.slice(0, 7), 12)}-01`;
  const daysMaturity = Math.max(daysNow, daysBetween(asset.applicationDate, targetIso));
  const yearsMaturity = daysMaturity / 365;
  const grossAtMaturity = principal * Math.pow(1 + annualRate, Math.max(0, yearsMaturity));
  const gainAtMaturity = Math.max(0, grossAtMaturity - principal);
  const irRateMaturity = exempt ? 0 : fixedIncomeIrRate(daysMaturity);
  const netAtMaturity = grossAtMaturity - gainAtMaturity * irRateMaturity;

  const totalDaysContract =
    !asset.noMaturity && asset.maturityDate
      ? Math.max(1, daysBetween(asset.applicationDate, asset.maturityDate))
      : null;
  const elapsedPct = totalDaysContract ? Math.min(100, (daysNow / totalDaysContract) * 100) : null;
  const couponsTotal = (asset.coupons || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return {
    principal,
    annualRatePct: annualRate * 100,
    rateLabel: formatFixedRateLabel(asset),
    daysNow,
    exempt,
    irRateTodayPct: irRateToday * 100,
    grossToday,
    taxToday,
    netToday,
    netGainToday: netToday - principal,
    netGainTodayPct: principal > 0 ? ((netToday - principal) / principal) * 100 : 0,
    targetIso,
    grossAtMaturity,
    netAtMaturity,
    netGainAtMaturity: netAtMaturity - principal,
    elapsedPct,
    couponsTotal,
  };
}

/* ============================================================================
 * 5. ALUGUÉIS (CAUÇÃO CORRIGIDA, FCI E REAJUSTE IGP-M/IPCA)
 * ============================================================================ */

export const SAVINGS_MONTHLY_RATE = 0.0055; // ~0.55% a.m. poupança

export function calculateCorrectedDeposit(
  amount: number,
  fromIso: string | undefined,
  toIso: string = todayIso(),
): number {
  if (!fromIso || !Number.isFinite(amount) || amount <= 0) return amount || 0;
  const months = Math.max(0, monthsBetweenIso(fromIso, toIso));
  return amount * Math.pow(1 + SAVINGS_MONTHLY_RATE, months);
}

export function calculateRentalFciMonthly(rental: RentalContract): number {
  return (Number(rental.monthlyAmount) || 0) * ((Number(rental.fciPercent) || 0) / 100);
}

/* ============================================================================
 * 6. ORÇAMENTO ANUAL COM REAJUSTE E DEDUÇÕES DE FOLHA (BRUTO -> LÍQUIDO)
 * ============================================================================ */

export function applyIndexAdjustment(
  baseValue: number,
  adjustType: "none" | "ipca" | "igpm" | "customPct",
  monthIndex1to12: number,
  adjustMonth1to12: number | undefined,
  customPct: number | undefined,
  settings: AppSettings,
): number {
  const val = Number(baseValue) || 0;
  if (!adjustType || adjustType === "none") return val;
  const triggerMonth = adjustMonth1to12 || 1;
  if (monthIndex1to12 < triggerMonth) return val;

  let pctAnnual = 0;
  if (adjustType === "ipca") pctAnnual = Number(settings.ipcaAnnual) || 0;
  else if (adjustType === "igpm") pctAnnual = Number(settings.igpmAnnual) || 0;
  else if (adjustType === "customPct") pctAnnual = Number(customPct) || 0;

  return val * (1 + pctAnnual / 100);
}

export function computeBudgetLineMonthValue(
  item: BudgetLineItem,
  month1to12: number,
  settings: AppSettings,
): { gross: number; deductions: number; net: number } {
  const gross =
    item.mode === "custom"
      ? Number((item.monthlyValues || {})[month1to12]) || 0
      : applyIndexAdjustment(
          item.baseValue,
          item.adjustType,
          month1to12,
          item.adjustMonth,
          item.customPct,
          settings,
        );

  const deductions = (item.deductions || []).reduce(
    (sum, d) =>
      sum +
      applyIndexAdjustment(
        d.amount,
        d.adjustType,
        month1to12,
        item.adjustMonth,
        d.customPct,
        settings,
      ),
    0,
  );

  return {
    gross,
    deductions,
    net: Math.max(0, gross - deductions),
  };
}

/* ============================================================================
 * 7. PERSPECTIVA PATRIMONIAL (PROJEÇÃO COMPOSTA MULTI-ANOS)
 * ============================================================================ */

export interface WealthPerspectivePoint {
  monthOffset: number;
  yearLabel: string;
  totalInvestedCapital: number;
  conservativePatrimony: number;
  basePatrimony: number;
  optimisticPatrimony: number;
  estimatedMonthlyPassiveIncome: number;
}

export function buildWealthPerspective(
  initialPortfolio: number,
  monthlyContribution: number,
  annualBaseRatePct: number,
  yearsHorizon: number,
): WealthPerspectivePoint[] {
  const months = Math.max(12, yearsHorizon * 12);
  const rBase = Math.pow(1 + annualBaseRatePct / 100, 1 / 12) - 1;
  const rCons = Math.pow(1 + Math.max(2, annualBaseRatePct - 2.5) / 100, 1 / 12) - 1;
  const rOpt = Math.pow(1 + (annualBaseRatePct + 3.0) / 100, 1 / 12) - 1;

  let cap = initialPortfolio;
  let cons = initialPortfolio;
  let base = initialPortfolio;
  let opt = initialPortfolio;

  const points: WealthPerspectivePoint[] = [
    {
      monthOffset: 0,
      yearLabel: "Hoje",
      totalInvestedCapital: cap,
      conservativePatrimony: cons,
      basePatrimony: base,
      optimisticPatrimony: opt,
      estimatedMonthlyPassiveIncome: base * rBase,
    },
  ];

  for (let m = 1; m <= months; m++) {
    cap += monthlyContribution;
    cons = cons * (1 + rCons) + monthlyContribution;
    base = base * (1 + rBase) + monthlyContribution;
    opt = opt * (1 + rOpt) + monthlyContribution;

    if (m % 6 === 0 || m === months) {
      const yrs = m / 12;
      points.push({
        monthOffset: m,
        yearLabel: Number.isInteger(yrs) ? `${yrs}a` : `${m}m`,
        totalInvestedCapital: Math.round(cap),
        conservativePatrimony: Math.round(cons),
        basePatrimony: Math.round(base),
        optimisticPatrimony: Math.round(opt),
        estimatedMonthlyPassiveIncome: Math.round(base * rBase),
      });
    }
  }

  return points;
}
