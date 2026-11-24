import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard as CreditCardIcon,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useWealth } from "../contexts/WealthContext";
import {
  addMonthsIso,
  brl,
  currentMonthIso,
  formatDate,
  monthFullLabel,
  monthLabel,
  todayIso,
} from "../lib/format";
import {
  expandCardPurchaseSchedule,
  getCardUsedLimit,
  splitInstallmentsExact,
  suggestFirstInvoiceMonth,
} from "../lib/finance-engine";
import { Badge, EmptyState, Modal, Panel, ProgressBar, SectionHeader, StatCard } from "./ui/WealthUI";
import type { PurchaseMode } from "../types/wealth";

export function CreditCardsView() {
  const {
    state,
    upsertCreditCard,
    removeCreditCard,
    addCardPurchase,
    removeCardPurchase,
    payCardInvoiceMonth,
  } = useWealth();

  const [invoiceMonth, setInvoiceMonth] = useState(currentMonthIso());
  const [selectedCardFilter, setSelectedCardFilter] = useState<string>("all");
  const [showNewCardModal, setShowNewCardModal] = useState(false);

  const [cardForm, setCardForm] = useState({
    name: "",
    brand: "Mastercard Black",
    limitAmount: "25000",
    closingDay: "5",
    dueDay: "12",
    color: "#8B5CF6",
  });

  const defaultCard = state.creditCards[0];
  const [purchaseForm, setPurchaseForm] = useState({
    cardId: defaultCard?.id || "",
    description: "",
    categoryId: "cat_cartao",
    purchaseDate: todayIso(),
    mode: "installments" as PurchaseMode,
    totalAmount: "",
    installmentsTotal: "10",
    currentInstallment: "1",
    firstChargeMonth: defaultCard
      ? suggestFirstInvoiceMonth(todayIso(), defaultCard.closingDay)
      : currentMonthIso(),
    notes: "",
  });

  const expenseCategories = useMemo(
    () => state.categories.filter((c) => c.kind === "expense"),
    [state.categories],
  );

  // Todas as parcelas expandidas de todas as compras
  const allExpandedEntries = useMemo(
    () => state.cardPurchases.flatMap(expandCardPurchaseSchedule),
    [state.cardPurchases],
  );

  // Projeção de 12 meses a partir do mês atual
  const projectionMonths = useMemo(
    () => Array.from({ length: 12 }, (_, i) => addMonthsIso(currentMonthIso(), i)),
    [],
  );

  // Totais para os KPIs do topo
  const kpis = useMemo(() => {
    const thisMonthEntries = allExpandedEntries.filter((e) => e.month === invoiceMonth);
    const nextMonthYm = addMonthsIso(invoiceMonth, 1);
    const nextMonthEntries = allExpandedEntries.filter((e) => e.month === nextMonthYm);

    const thisMonthTotal = thisMonthEntries.reduce((s, e) => s + e.amount, 0);
    const nextMonthTotal = nextMonthEntries.reduce((s, e) => s + e.amount, 0);
    const openFutureInstallments = allExpandedEntries
      .filter((e) => e.month >= invoiceMonth && !e.isPaid && e.mode !== "recurring")
      .reduce((s, e) => s + e.amount, 0);

    const totalLimit = state.creditCards.reduce((s, c) => s + c.limitAmount, 0);
    const totalUsed = state.creditCards.reduce(
      (s, c) => s + getCardUsedLimit(c, state.cardPurchases, invoiceMonth),
      0,
    );

    return {
      thisMonthTotal,
      nextMonthTotal,
      openFutureInstallments,
      availableLimit: Math.max(0, totalLimit - totalUsed),
      totalLimit,
    };
  }, [allExpandedEntries, invoiceMonth, state.creditCards, state.cardPurchases]);

  // Entradas da fatura do mês selecionado (filtradas por cartão ou todas)
  const currentInvoiceEntries = useMemo(() => {
    return allExpandedEntries
      .filter(
        (e) =>
          e.month === invoiceMonth &&
          (selectedCardFilter === "all" || e.cardId === selectedCardFilter),
      )
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [allExpandedEntries, invoiceMonth, selectedCardFilter]);

  // Preview de parcelamento exato em tempo real no formulário
  const installmentPreview = useMemo(() => {
    const val = Number(purchaseForm.totalAmount.replace(",", ".")) || 0;
    if (val <= 0) return null;
    if (purchaseForm.mode === "single") {
      return `Cobrança única de ${brl(val)} na fatura de ${monthLabel(purchaseForm.firstChargeMonth)}`;
    }
    if (purchaseForm.mode === "recurring") {
      const m = Math.max(1, Number(purchaseForm.installmentsTotal) || 12);
      return `Assinatura mensal de ${brl(val)}/mês lançada pelos próximos ${m} meses`;
    }
    const n = Math.max(1, Number(purchaseForm.installmentsTotal) || 1);
    const cur = Math.max(1, Math.min(n, Number(purchaseForm.currentInstallment) || 1));
    const parts = splitInstallmentsExact(val, n);
    const firstPart = parts[0] ?? 0;
    const lastPart = parts[parts.length - 1] ?? 0;
    const remCount = n - cur + 1;
    const remSum = parts.slice(cur - 1).reduce((s, x) => s + x, 0);
    return `${n}x de ${brl(firstPart)}${firstPart !== lastPart ? ` (última ${brl(lastPart)} p/ fechar centavos exatos)` : ""} · Restam ${remCount} parcela(s) = ${brl(remSum)}`;
  }, [purchaseForm]);

  const handleCreateCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardForm.name.trim()) {
      toast.error("Informe o nome do cartão.");
      return;
    }
    upsertCreditCard({
      name: cardForm.name.trim(),
      brand: cardForm.brand.trim() || "Crédito",
      limitAmount: Number(cardForm.limitAmount.replace(",", ".")) || 10000,
      closingDay: Math.min(31, Math.max(1, Number(cardForm.closingDay) || 5)),
      dueDay: Math.min(31, Math.max(1, Number(cardForm.dueDay) || 12)),
      color: cardForm.color,
    });
    toast.success("Cartão cadastrado com sucesso!");
    setShowNewCardModal(false);
    setCardForm({
      name: "",
      brand: "Mastercard Black",
      limitAmount: "25000",
      closingDay: "5",
      dueDay: "12",
      color: "#8B5CF6",
    });
  };

  const handleAddPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const cardId = purchaseForm.cardId || state.creditCards[0]?.id;
    if (!cardId) {
      toast.error("Cadastre ou selecione um cartão primeiro.");
      return;
    }
    if (!purchaseForm.description.trim()) {
      toast.error("Informe a descrição do gasto.");
      return;
    }
    const amount = Number(purchaseForm.totalAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe um valor válido maior que zero.");
      return;
    }

    const n =
      purchaseForm.mode === "single"
        ? 1
        : Math.max(1, Number(purchaseForm.installmentsTotal) || 1);
    const cur =
      purchaseForm.mode === "installments"
        ? Math.max(1, Math.min(n, Number(purchaseForm.currentInstallment) || 1))
        : 1;

    addCardPurchase({
      cardId,
      description: purchaseForm.description.trim(),
      categoryId: purchaseForm.categoryId || "cat_cartao",
      purchaseDate: purchaseForm.purchaseDate,
      firstChargeMonth: purchaseForm.firstChargeMonth,
      mode: purchaseForm.mode,
      totalAmount: amount,
      installmentsTotal: n,
      currentInstallment: cur,
      recurring: purchaseForm.mode === "recurring",
      notes: purchaseForm.notes.trim() || undefined,
    });

    toast.success("Gasto lançado na fatura do cartão!");
    setPurchaseForm((prev) => ({
      ...prev,
      description: "",
      totalAmount: "",
      notes: "",
    }));
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Gestão de Crédito & Faturas"
        title="Cartões de Crédito & Acompanhamento de Faturas"
        subtitle="Lance compras à vista, parceladas (com divisão exata de centavos) ou assinaturas e acompanhe suas faturas mês a mês"
        actions={
          <button
            onClick={() => setShowNewCardModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-amber-400"
          >
            <Plus className="size-4" />
            Novo Cartão
          </button>
        }
      />

      {/* KPIs de Fatura */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Fatura (${monthLabel(invoiceMonth)})`}
          value={brl(kpis.thisMonthTotal)}
          tone="gold"
          icon={<Receipt className="size-4 text-amber-400" />}
          hint={`${currentInvoiceEntries.length} itens nesta competência`}
        />
        <StatCard
          label={`Próxima Fatura (${monthLabel(addMonthsIso(invoiceMonth, 1))})`}
          value={brl(kpis.nextMonthTotal)}
          tone="default"
          hint="Comprometido para o mês seguinte"
        />
        <StatCard
          label="Total Parcelado em Aberto"
          value={brl(kpis.openFutureInstallments)}
          tone="negative"
          hint="Soma de todas as parcelas futuras"
        />
        <StatCard
          label="Limite Disponível Consolidado"
          value={brl(kpis.availableLimit)}
          tone="positive"
          hint={`Limite total: ${brl(kpis.totalLimit)}`}
        />
      </div>

      {/* Cartões Cadastrados + Formulário de Lançamento Rápido */}
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Formulário de Novo Gasto no Cartão */}
        <Panel
          title="Lançar Gasto no Cartão"
          subtitle="À vista, parcelado em N vezes ou assinatura recorrente"
        >
          <form onSubmit={handleAddPurchase} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Cartão</label>
              <select
                value={purchaseForm.cardId || state.creditCards[0]?.id || ""}
                onChange={(e) => {
                  const cid = e.target.value;
                  const card = state.creditCards.find((c) => c.id === cid);
                  setPurchaseForm({
                    ...purchaseForm,
                    cardId: cid,
                    firstChargeMonth: card
                      ? suggestFirstInvoiceMonth(purchaseForm.purchaseDate, card.closingDay)
                      : purchaseForm.firstChargeMonth,
                  });
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              >
                {state.creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Fecha dia {c.closingDay})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Descrição do Gasto
              </label>
              <input
                type="text"
                placeholder="Ex.: iPhone 16 Pro, Supermercado, Seguro..."
                value={purchaseForm.description}
                onChange={(e) =>
                  setPurchaseForm({ ...purchaseForm, description: e.target.value })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Modalidade</label>
                <select
                  value={purchaseForm.mode}
                  onChange={(e) =>
                    setPurchaseForm({ ...purchaseForm, mode: e.target.value as PurchaseMode })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="single">À Vista (1x)</option>
                  <option value="installments">Parcelado (Nx)</option>
                  <option value="recurring">Assinatura Recorrente</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Categoria</label>
                <select
                  value={purchaseForm.categoryId}
                  onChange={(e) =>
                    setPurchaseForm({ ...purchaseForm, categoryId: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  {expenseCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  {purchaseForm.mode === "installments"
                    ? "Valor Total da Compra (R$)"
                    : purchaseForm.mode === "recurring"
                      ? "Valor Mensal (R$)"
                      : "Valor (R$)"}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={purchaseForm.totalAmount}
                  onChange={(e) =>
                    setPurchaseForm({ ...purchaseForm, totalAmount: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Data da Compra
                </label>
                <input
                  type="date"
                  value={purchaseForm.purchaseDate}
                  onChange={(e) => {
                    const dt = e.target.value;
                    const card = state.creditCards.find(
                      (c) => c.id === (purchaseForm.cardId || state.creditCards[0]?.id),
                    );
                    setPurchaseForm({
                      ...purchaseForm,
                      purchaseDate: dt,
                      firstChargeMonth: card
                        ? suggestFirstInvoiceMonth(dt, card.closingDay)
                        : purchaseForm.firstChargeMonth,
                    });
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            {purchaseForm.mode === "installments" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Total de Parcelas
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="48"
                    value={purchaseForm.installmentsTotal}
                    onChange={(e) =>
                      setPurchaseForm({ ...purchaseForm, installmentsTotal: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Iniciar na Parcela #
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={purchaseForm.installmentsTotal || 48}
                    value={purchaseForm.currentInstallment}
                    onChange={(e) =>
                      setPurchaseForm({ ...purchaseForm, currentInstallment: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {purchaseForm.mode === "recurring" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Projetar por quantos meses?
                </label>
                <input
                  type="number"
                  min="1"
                  max="36"
                  value={purchaseForm.installmentsTotal}
                  onChange={(e) =>
                    setPurchaseForm({ ...purchaseForm, installmentsTotal: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Fatura da 1ª Cobrança
              </label>
              <input
                type="month"
                value={purchaseForm.firstChargeMonth}
                onChange={(e) =>
                  setPurchaseForm({ ...purchaseForm, firstChargeMonth: e.target.value })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </div>

            {installmentPreview && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                {installmentPreview}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 shadow transition hover:bg-amber-400"
            >
              Lançar na Fatura
            </button>
          </form>
        </Panel>

        {/* Navegador de Faturas Mês a Mês & Detalhamento de Itens */}
        <Panel
          title={`Fatura Detalhada — ${monthFullLabel(invoiceMonth)}`}
          subtitle="Navegue entre os meses para inspecionar parcelas ou baixar o pagamento da fatura"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCardFilter}
                onChange={(e) => setSelectedCardFilter(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="all">Todos os Cartões</option>
                {state.creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center rounded-xl border border-slate-700 bg-slate-950 p-0.5">
                <button
                  onClick={() => setInvoiceMonth(addMonthsIso(invoiceMonth, -1))}
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800"
                  title="Mês anterior"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="px-3 font-mono text-xs font-semibold text-amber-400">
                  {monthLabel(invoiceMonth)}
                </span>
                <button
                  onClick={() => setInvoiceMonth(addMonthsIso(invoiceMonth, 1))}
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800"
                  title="Próximo mês"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          }
        >
          {/* Cards de resumo de cada cartão nesta fatura */}
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            {state.creditCards.map((card) => {
              const cardEntries = allExpandedEntries.filter(
                (e) => e.cardId === card.id && e.month === invoiceMonth,
              );
              const cardMonthSum = cardEntries.reduce((s, e) => s + e.amount, 0);
              const allPaid = cardEntries.length > 0 && cardEntries.every((e) => e.isPaid);
              const usedLimit = getCardUsedLimit(card, state.cardPurchases, invoiceMonth);
              const usedPct = card.limitAmount > 0 ? (usedLimit / card.limitAmount) * 100 : 0;

              return (
                <div
                  key={card.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/75 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CreditCardIcon className="size-4 text-amber-400" />
                        <span className="text-sm font-bold text-slate-100">{card.name}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {card.brand} · Fecha dia {card.closingDay} · Vence dia {card.dueDay}
                      </p>
                    </div>
                    <button
                      onClick={() => removeCreditCard(card.id)}
                      className="rounded p-1 text-slate-500 hover:text-rose-400"
                      title="Excluir cartão"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-[11px] uppercase text-slate-400">
                        Fatura {monthLabel(invoiceMonth)}
                      </span>
                      <p className="font-mono text-lg font-bold text-slate-100 tabular-nums">
                        {brl(cardMonthSum)}
                      </p>
                    </div>
                    {cardMonthSum > 0 && (
                      <div>
                        {allPaid ? (
                          <Badge tone="positive">
                            <CheckCircle2 className="size-3" /> Fatura Paga
                          </Badge>
                        ) : (
                          <button
                            onClick={() => payCardInvoiceMonth(card.id, invoiceMonth)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                          >
                            <CheckCircle2 className="size-3.5" />
                            Baixar Fatura
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    <ProgressBar pct={usedPct} tone="purple" height="h-1.5" />
                    <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                      <span>Limite tomado: {brl(usedLimit)}</span>
                      <span>Livre: {brl(Math.max(0, card.limitAmount - usedLimit))}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lista de Itens da Fatura do Mês Selecionado */}
          {currentInvoiceEntries.length === 0 ? (
            <EmptyState
              title={`Nenhum lançamento na fatura de ${monthLabel(invoiceMonth)}`}
              description="Use o formulário ao lado para lançar compras à vista, parceladas ou assinaturas."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="pb-2.5 pr-3">Data Compra</th>
                    <th className="pb-2.5 pr-3">Descrição & Parcela</th>
                    <th className="pb-2.5 pr-3">Cartão</th>
                    <th className="pb-2.5 pr-3">Categoria</th>
                    <th className="pb-2.5 pr-3 text-right">Valor na Fatura</th>
                    <th className="pb-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {currentInvoiceEntries.map((item) => {
                    const card = state.creditCards.find((c) => c.id === item.cardId);
                    const cat = state.categories.find((c) => c.id === item.categoryId);
                    return (
                      <tr
                        key={`${item.purchaseId}_${item.installmentNumber}`}
                        className="hover:bg-slate-800/30"
                      >
                        <td className="py-3 pr-3 font-mono text-xs text-slate-400">
                          {formatDate(item.purchaseDate)}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-100">{item.description}</span>
                            {item.isPaid && <Badge tone="positive">Pago</Badge>}
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-xs text-slate-300">{card?.name ?? "—"}</td>
                        <td className="py-3 pr-3 text-xs text-slate-400">
                          {cat?.name ?? "Cartão"}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono font-semibold text-slate-100 tabular-nums">
                          {brl(item.amount)}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => removeCardPurchase(item.purchaseId)}
                            className="rounded p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-400"
                            title="Excluir compra e todas as suas parcelas"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Grade de Projeção de Faturas para 12 Meses */}
      <Panel
        title="Projeção de Faturas — Próximos 12 Meses"
        subtitle="Visão matricial do comprometimento mensal por cartão de crédito"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="pb-3 pr-4">Cartão</th>
                {projectionMonths.map((m) => (
                  <th
                    key={m}
                    onClick={() => setInvoiceMonth(m)}
                    className={`cursor-pointer pb-3 pr-3 text-right transition hover:text-amber-400 ${
                      m === invoiceMonth ? "text-amber-400 underline" : ""
                    }`}
                  >
                    {monthLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {state.creditCards.map((card) => (
                <tr key={card.id} className="hover:bg-slate-800/30">
                  <td className="whitespace-nowrap py-3 pr-4 font-medium text-slate-200">
                    {card.name}
                  </td>
                  {projectionMonths.map((m) => {
                    const val = allExpandedEntries
                      .filter((e) => e.cardId === card.id && e.month === m)
                      .reduce((s, e) => s + e.amount, 0);
                    return (
                      <td
                        key={m}
                        onClick={() => setInvoiceMonth(m)}
                        className="cursor-pointer whitespace-nowrap py-3 pr-3 text-right font-mono text-xs tabular-nums text-slate-300 hover:text-amber-300"
                      >
                        {val > 0 ? brl(val) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-700 bg-slate-950/50 font-bold">
                <td className="py-3 pr-4 text-slate-100">Total Faturas</td>
                {projectionMonths.map((m) => {
                  const totalM = allExpandedEntries
                    .filter((e) => e.month === m)
                    .reduce((s, e) => s + e.amount, 0);
                  return (
                    <td
                      key={m}
                      className="whitespace-nowrap py-3 pr-3 text-right font-mono text-xs text-amber-400 tabular-nums"
                    >
                      {totalM > 0 ? brl(totalM) : "—"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Modal de Novo Cartão */}
      <Modal
        open={showNewCardModal}
        onClose={() => setShowNewCardModal(false)}
        title="Cadastrar Novo Cartão de Crédito"
        subtitle="Configure limite, dia de fechamento da fatura e dia de vencimento"
      >
        <form onSubmit={handleCreateCard} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Nome do Cartão
            </label>
            <input
              type="text"
              placeholder="Ex.: Itaú Personnalité Black"
              value={cardForm.name}
              onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Bandeira / Emissor
              </label>
              <input
                type="text"
                value={cardForm.brand}
                onChange={(e) => setCardForm({ ...cardForm, brand: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Limite Total (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={cardForm.limitAmount}
                onChange={(e) => setCardForm({ ...cardForm, limitAmount: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Dia de Fechamento
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={cardForm.closingDay}
                onChange={(e) => setCardForm({ ...cardForm, closingDay: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Dia de Vencimento
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={cardForm.dueDay}
                onChange={(e) => setCardForm({ ...cardForm, dueDay: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewCardModal(false)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Salvar Cartão
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
