export type NavSectionId =
  | "dashboard"
  | "cartoes"
  | "investimentos"
  | "dividas"
  | "lancamentos"
  | "orcamento"
  | "fluxo"
  | "alugueis"
  | "metas"
  | "config";

export interface AppSettings {
  referenceYear: number;
  cdiAnnual: number;      // e.g. 11.25 (%)
  selicAnnual: number;    // e.g. 11.25 (%)
  ipcaAnnual: number;     // e.g. 4.50 (%)
  ipcaMonth: number;      // 1..12
  igpmAnnual: number;     // e.g. 3.80 (%)
  igpmMonth: number;      // 1..12
  b3SheetApiUrl: string;  // Google Apps Script Web App URL (GOOGLEFINANCE)
  googleSpreadsheetUrl: string; // Direct URL to open the Google Sheet
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  githubToken?: string;
  githubRepo?: string;
  githubPath?: string;
  theme: "dark" | "light";
}

export interface BankAccount {
  id: string;
  name: string;
  institution: string;
  type: "checking" | "savings" | "brokerage" | "wallet";
  openingBalance: number;
  color: string;
}

export interface Category {
  id: string;
  name: string;
  kind: "income" | "expense";
  group: string;
  color: string;
  monthlyBudget: number;
}

export interface SalaryDeduction {
  id: string;
  name: string; // e.g., INSS, IRRF, Plano de Saúde
  amount: number;
  adjustType: "none" | "ipca" | "igpm" | "customPct";
  customPct?: number;
}

export interface BudgetLineItem {
  id: string;
  name: string;
  type: "income" | "expense";
  categoryId: string;
  group: string;
  mode: "fixed" | "custom";
  baseValue: number;
  monthlyValues?: Record<number, number>; // 1..12
  adjustType: "none" | "ipca" | "igpm" | "customPct";
  adjustMonth?: number; // 1..12
  referenceMonth?: number; // 1..12
  customPct?: number;
  deductions?: SalaryDeduction[];
}

export interface CreditCard {
  id: string;
  name: string;
  brand: string;
  limitAmount: number;
  closingDay: number;
  dueDay: number;
  color: string;
}

export type PurchaseMode = "single" | "installments" | "recurring";

export interface CardPurchase {
  id: string;
  cardId: string;
  description: string;
  categoryId: string;
  purchaseDate: string;      // YYYY-MM-DD
  firstChargeMonth: string;  // YYYY-MM
  mode: PurchaseMode;
  totalAmount: number;       // Total purchase value (or monthly value if recurring)
  installmentsTotal: number; // 1 for single, N for installments, months count for recurring
  currentInstallment: number; // Starts at 1 (or k if mid-way purchase)
  recurring: boolean;
  notes?: string;
  paidMonths?: string[];     // Array of "YYYY-MM" invoices where this purchase installment was paid
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  kind: "income" | "expense";
  status: "realized" | "planned";
  categoryId: string;
  accountId?: string;
  cardId?: string;
  cardPurchaseId?: string;
  debtId?: string;
  debtInstallmentNumber?: number;
  rentalId?: string;
  recurring?: boolean;
  notes?: string;
}

export type VariableAssetType = "Ação" | "FII" | "ETF" | "BDR" | "Cripto";

export interface VariableAsset {
  id: string;
  ticker: string;
  name: string;
  type: VariableAssetType;
  segment: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  dayChangePct: number;
  pvp: number | null;
  lastDividendPerShare: number;
  targetShares: number | null;
  lastUpdated: string; // YYYY-MM-DD
}

export interface AssetTrade {
  id: string;
  ticker: string;
  assetType: VariableAssetType;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  tradeDate: string; // YYYY-MM-DD
  syncedToSheet: boolean;
  notes?: string;
}

export interface AssetDividend {
  id: string;
  ticker: string;
  type: "Dividendo" | "JCP" | "Rendimento FII" | "Bonificação";
  amount: number;
  perShare?: number;
  payDate: string; // YYYY-MM-DD
  notes?: string;
}

export type FixedIncomeType =
  | "Tesouro Selic"
  | "Tesouro IPCA+"
  | "Tesouro Prefixado"
  | "CDB"
  | "LCI"
  | "LCA"
  | "CRI"
  | "CRA"
  | "Debênture"
  | "Caixinha / Liquidez Diária";

export type FixedRateType = "posCDI" | "posSelic" | "ipcaMais" | "pre";

export interface FixedCouponEntry {
  id: string;
  date: string;
  amount: number;
  description?: string;
}

export interface FixedIncomeAsset {
  id: string;
  title: string;
  institution: string;
  type: FixedIncomeType;
  rateType: FixedRateType;
  rateValue: number; // e.g. 110 (% CDI), 6.25 (IPCA + 6.25%), 12.5 (% pre)
  principal: number;
  applicationDate: string; // YYYY-MM-DD
  maturityDate: string | null; // YYYY-MM-DD
  noMaturity: boolean;
  taxExempt: boolean; // Auto true for LCI, LCA, CRI, CRA
  coupons?: FixedCouponEntry[];
}

export interface InvestmentFund {
  id: string;
  name: string;
  institution: string;
  type: "Multimercado" | "Renda Fixa" | "Ações" | "Previdência (PGBL/VGBL)" | "Cambial";
  investedAmount: number;
  currentValue: number;
  lastUpdated: string;
  incomeEntries?: FixedCouponEntry[];
  valueHistory?: { date: string; value: number }[];
}

export type DebtKind = "financing" | "loan" | "consortium" | "installment_agreement" | "other";
export type AmortizationSystem = "price" | "sac" | "fixed";

export interface DebtInstallmentPayment {
  installmentNumber: number;
  settlementDate: string; // YYYY-MM-DD
  paidAmount: number;
  faceAmount: number;
  discount: number;
  isPrepayment: boolean;
  transactionId?: string;
}

export interface DebtContract {
  id: string;
  name: string;
  kind: DebtKind;
  lender: string;
  amortizationSystem: AmortizationSystem;
  principal: number;
  interestRateMonthly: number; // % per month e.g. 0.89
  installmentsTotal: number;
  installmentAmount?: number; // Custom fixed installment if system === "fixed"
  startDate: string; // YYYY-MM-DD (month of 1st installment)
  dueDay: number;
  categoryId: string;
  payments: Record<number, DebtInstallmentPayment>; // keyed by installmentNumber (1..N)
  status: "active" | "paid";
}

export interface RentalFciEntry {
  id: string;
  rentalId: string;
  referenceMonth: string; // YYYY-MM
  amount: number;
  paidDate: string;
}

export interface RentalRenewal {
  id: string;
  rentalId: string;
  previousAmount: number;
  newAmount: number;
  fciPercent: number;
  effectiveDate: string;
  newEndDate?: string;
}

export interface RentalContract {
  id: string;
  propertyName: string;
  role: "landlord" | "tenant";
  counterpart: string;
  monthlyAmount: number;
  dueDay: number;
  startDate: string;
  endDate?: string;
  adjustmentIndex: "IGP-M" | "IPCA" | "Fixo";
  adjustMonth: number; // 1..12
  depositAmount: number; // Caução
  depositDate?: string;
  fciPercent: number; // e.g., 5%
  categoryId?: string;
  status: "active" | "ended";
}

export interface FinancialGoal {
  id: string;
  name: string;
  category: "Emergência" | "Aposentadoria" | "Imóvel" | "Viagem" | "Quitação" | "Outro";
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  monthlyContributionPlan?: number;
}

export interface WealthState {
  settings: AppSettings;
  accounts: BankAccount[];
  categories: Category[];
  budgetItems: BudgetLineItem[];
  creditCards: CreditCard[];
  cardPurchases: CardPurchase[];
  transactions: Transaction[];
  variableAssets: VariableAsset[];
  trades: AssetTrade[];
  dividends: AssetDividend[];
  fixedIncome: FixedIncomeAsset[];
  funds: InvestmentFund[];
  debts: DebtContract[];
  rentals: RentalContract[];
  rentalFciEntries: RentalFciEntry[];
  rentalRenewals: RentalRenewal[];
  goals: FinancialGoal[];
}
