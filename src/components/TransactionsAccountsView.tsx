import React, { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Check,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useWealth } from "../contexts/WealthContext";
import {
  brl,
  currentMonthIso,
  formatDate,
  monthFullLabel,
  todayIso,
} from "../lib/format";
import { Badge, EmptyState, Modal, Panel, SectionHeader, StatCard } from "./ui/WealthUI";

export function TransactionsAccountsView() {
  const {
    state,
    upsertTransaction,
    removeTransaction,
    upsertAccount,
    removeAccount,
  } = useWealth();

  const [selectedMonth, setSelectedMonth] = useState(currentMonthIso());
  const [filterKind, setFilterKind] = useState<"all" | "income" | "expense">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAccountModal, setShowAccountModal] = useState(false);

  const [txForm, setTxForm] = useState({
    description: "",
    amount: "",
    date: todayIso(),
    kind: "expense" as "income" | "expense",
    status: "realized" as "realized" | "planned",
    categoryId: state.categories[3]?.id || "",
    accountId: state.accounts[0]?.id || "",
  });

  const [accForm, setAccForm] = useState({
    name: "",
    institution: "",
    type: "checking" as "checking" | "savings" | "brokerage" | "wallet",
    openingBalance: "0",
    color: "#F59E0B",
  });

  // Saldo atual calculado para cada conta bancária
  const accountsWithBalance = useMemo(() => {
    return state.accounts.map((acc) => {
      const mov = state.transactions
        .filter((t) => t.accountId === acc.id && t.status === "realized")
        .reduce(
          (s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)),
          0,
        );
      return {
        ...acc,
        currentBalance: (Number(acc.openingBalance) || 0) + mov,
      };
    });
  }, [state.accounts, state.transactions]);

  // Transações filtradas do mês
  const filteredTransactions = useMemo(() => {
    return state.transactions
      .filter((t) => t.date.slice(0, 7) === selectedMonth)
      .filter((t) => (filterKind === "all" ? true : t.kind === filterKind))
      .filter((t) =>
        searchQuery.trim()
          ? t.description.toLowerCase().includes(searchQuery.toLowerCase())
          : true,
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.transactions, selectedMonth, filterKind, searchQuery]);

  const monthTotals = useMemo(() => {
    const mTx = state.transactions.filter((t) => t.date.slice(0, 7) === selectedMonth);
    const inc = mTx
      .filter((t) => t.kind === "income" && t.status === "realized")
      .reduce((s, t) => s + Number(t.amount), 0);
    const exp = mTx
      .filter((t) => t.kind === "expense" && t.status === "realized")
      .reduce((s, t) => s + Number(t.amount), 0);
    const planned = mTx
      .filter((t) => t.status === "planned")
      .reduce(
        (s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)),
        0,
      );
    return { inc, exp, net: inc - exp, planned };
  }, [state.transactions, selectedMonth]);

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(txForm.amount.replace(",", "."));
    if (!txForm.description.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe a descrição e um valor válido.");
      return;
    }
    upsertTransaction({
      description: txForm.description.trim(),
      amount,
      date: txForm.date,
      kind: txForm.kind,
      status: txForm.status,
      categoryId: txForm.categoryId || state.categories[0]?.id || "cat_moradia",
      accountId: txForm.accountId || state.accounts[0]?.id,
    });
    toast.success("Lançamento registrado!");
    setTxForm((prev) => ({ ...prev, description: "", amount: "" }));
  };

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accForm.name.trim()) {
      toast.error("Informe o nome da conta.");
      return;
    }
    upsertAccount({
      name: accForm.name.trim(),
      institution: accForm.institution.trim() || "Banco",
      type: accForm.type,
      openingBalance: Number(accForm.openingBalance.replace(",", ".")) || 0,
      color: accForm.color,
    });
    toast.success("Conta bancária/corretora adicionada!");
    setShowAccountModal(false);
    setAccForm({
      name: "",
      institution: "",
      type: "checking",
      openingBalance: "0",
      color: "#F59E0B",
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Livro Caixa & Contas Bancárias"
        title="Lançamentos, Receitas, Despesas & Contas"
        subtitle={`Movimentação financeira detalhada em ${monthFullLabel(selectedMonth)}`}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
            />
            <button
              onClick={() => setShowAccountModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <Plus className="size-3.5" />
              Nova Conta
            </button>
          </div>
        }
      />

      {/* Saldos por Conta Bancária / Corretora */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {accountsWithBalance.map((acc) => (
          <div
            key={acc.id}
            className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/85 p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-amber-400" />
                <span className="text-xs font-semibold text-slate-200">{acc.name}</span>
              </div>
              <p className="mt-1.5 font-mono text-lg font-bold text-slate-100 tabular-nums">
                {brl(acc.currentBalance)}
              </p>
              <p className="text-[11px] text-slate-400">
                Saldo inicial: {brl(acc.openingBalance)}
              </p>
            </div>
            <button
              onClick={() => removeAccount(acc.id)}
              className="rounded p-1 text-slate-500 hover:text-rose-400"
              title="Remover conta"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <StatCard
          label="Resultado Líquido do Mês"
          value={brl(monthTotals.net)}
          tone={monthTotals.net >= 0 ? "positive" : "negative"}
          hint={`Entradas: ${brl(monthTotals.inc)} · Saídas: ${brl(monthTotals.exp)}`}
        />
      </div>

      {/* Formulário de Novo Lançamento + Tabela de Extrato */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Panel title="Novo Lançamento" subtitle="Receita ou despesa avulsa ou prevista">
          <form onSubmit={handleAddTx} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Tipo</label>
                <select
                  value={txForm.kind}
                  onChange={(e) =>
                    setTxForm({ ...txForm, kind: e.target.value as "income" | "expense" })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="expense">Despesa (-)</option>
                  <option value="income">Receita (+)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Status</label>
                <select
                  value={txForm.status}
                  onChange={(e) =>
                    setTxForm({
                      ...txForm,
                      status: e.target.value as "realized" | "planned",
                    })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="realized">Realizado (Pago/Recebido)</option>
                  <option value="planned">Previsto / Agendado</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Descrição</label>
              <input
                type="text"
                placeholder="Ex.: Salário, Supermercado, Energia..."
                value={txForm.description}
                onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={txForm.amount}
                  onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Data</label>
                <input
                  type="date"
                  value={txForm.date}
                  onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Categoria</label>
                <select
                  value={txForm.categoryId}
                  onChange={(e) => setTxForm({ ...txForm, categoryId: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  {state.categories
                    .filter((c) => c.kind === txForm.kind)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Conta</label>
                <select
                  value={txForm.accountId}
                  onChange={(e) => setTxForm({ ...txForm, accountId: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  {state.accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Registrar Lançamento
            </button>
          </form>
        </Panel>

        <Panel
          title="Extrato do Mês"
          subtitle={`${filteredTransactions.length} lançamento(s) encontrados`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar descrição..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-200"
                />
              </div>
              <select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as typeof filterKind)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="all">Todos</option>
                <option value="income">Apenas Receitas</option>
                <option value="expense">Apenas Despesas</option>
              </select>
            </div>
          }
        >
          {filteredTransactions.length === 0 ? (
            <EmptyState title="Nenhum lançamento neste mês com os filtros atuais" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="pb-2.5 pr-3">Data</th>
                    <th className="pb-2.5 pr-3">Descrição</th>
                    <th className="pb-2.5 pr-3">Categoria</th>
                    <th className="pb-2.5 pr-3">Status</th>
                    <th className="pb-2.5 pr-3 text-right">Valor</th>
                    <th className="pb-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTransactions.map((tx) => {
                    const cat = state.categories.find((c) => c.id === tx.categoryId);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/35">
                        <td className="py-3 pr-3 font-mono text-xs text-slate-400">
                          {formatDate(tx.date)}
                        </td>
                        <td className="py-3 pr-3 font-medium text-slate-100">{tx.description}</td>
                        <td className="py-3 pr-3 text-xs text-slate-300">{cat?.name ?? "—"}</td>
                        <td className="py-3 pr-3">
                          {tx.status === "realized" ? (
                            <Badge tone="positive">Realizado</Badge>
                          ) : (
                            <button
                              onClick={() =>
                                upsertTransaction({ ...tx, status: "realized" })
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25"
                            >
                              <Check className="size-3" /> Confirmar
                            </button>
                          )}
                        </td>
                        <td
                          className={`py-3 pr-3 text-right font-mono font-bold tabular-nums ${
                            tx.kind === "income" ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {tx.kind === "income" ? "+" : "-"} {brl(tx.amount)}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => removeTransaction(tx.id)}
                            className="rounded p-1.5 text-slate-500 hover:text-rose-400"
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

      {/* Modal de Nova Conta */}
      <Modal
        open={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        title="Adicionar Conta Bancária ou Corretora"
      >
        <form onSubmit={handleAddAccount} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Nome da Conta</label>
            <input
              type="text"
              placeholder="Ex.: Itaú Personnalité, BTG Pactual"
              value={accForm.name}
              onChange={(e) => setAccForm({ ...accForm, name: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Instituição</label>
              <input
                type="text"
                value={accForm.institution}
                onChange={(e) => setAccForm({ ...accForm, institution: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Saldo Inicial (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={accForm.openingBalance}
                onChange={(e) => setAccForm({ ...accForm, openingBalance: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAccountModal(false)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950"
            >
              Salvar Conta
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
