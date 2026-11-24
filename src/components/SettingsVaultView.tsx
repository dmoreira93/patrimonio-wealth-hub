import React, { useState } from "react";
import {
  Cloud,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useWealth } from "../contexts/WealthContext";
import {
  decryptWealthState,
  downloadJsonFile,
  encryptWealthState,
  type EncryptedVaultPayload,
} from "../lib/crypto-vault";
import { GOOGLE_APPS_SCRIPT_TEMPLATE } from "../lib/google-sheets";
import { Panel, SectionHeader } from "./ui/WealthUI";
import type { WealthState } from "../types/wealth";

export function SettingsVaultView() {
  const {
    state,
    isSyncingSheet,
    isSyncingCloud,
    updateSettings,
    replaceFullState,
    resetToDemoSeed,
    syncWithGoogleSheet,
    pushAllTickersToGoogleSheet,
    pushToSupabaseCloud,
    pullFromSupabaseCloud,
  } = useWealth();

  const [vaultPassword, setVaultPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [showScriptCode, setShowScriptCode] = useState(false);

  const handleExportEncryptedVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultPassword || vaultPassword.length < 4) {
      toast.error("Defina uma senha de pelo menos 4 caracteres para criptografar o cofre.");
      return;
    }
    try {
      const encrypted = await encryptWealthState(state, vaultPassword);
      downloadJsonFile(
        `patrimonio-cofre-aes256-${new Date().toISOString().slice(0, 10)}.json`,
        encrypted,
      );
      toast.success("Cofre criptografado (AES-GCM 256-bit) exportado com sucesso!");
    } catch (err) {
      toast.error("Falha ao criptografar backup.");
    }
  };

  const handleExportPlainJson = () => {
    downloadJsonFile(
      `patrimonio-snapshot-${new Date().toISOString().slice(0, 10)}.json`,
      state,
    );
    toast.success("Snapshot JSON exportado!");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Verifica se é um cofre criptografado AES-GCM
      if (parsed && parsed.ciphertext && parsed.iv && parsed.salt) {
        const pwd =
          importPassword ||
          window.prompt("Digite a senha do cofre criptografado para desbloquear:") ||
          "";
        if (!pwd) {
          toast.error("Senha obrigatória para descriptografar o cofre.");
          return;
        }
        const unlocked = await decryptWealthState<WealthState>(
          parsed as EncryptedVaultPayload,
          pwd,
        );
        replaceFullState(unlocked);
        toast.success("Cofre AES-GCM descriptografado e restaurado com sucesso!");
      } else if (parsed && parsed.settings && Array.isArray(parsed.variableAssets)) {
        replaceFullState(parsed as WealthState);
        toast.success("Snapshot JSON restaurado com sucesso!");
      } else {
        toast.error("Formato de arquivo não reconhecido.");
      }
    } catch (err) {
      toast.error("Senha incorreta ou arquivo corrompido.");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Integrações, Indexadores & Segurança"
        title="Configurações, Planilha GOOGLEFINANCE & Cofre Criptografado"
        subtitle="Configure a integração com o Google Planilhas (B3), sincronização com Supabase, índices macroeconômicos e backup AES-GCM 256-bit"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. Integração Planilha Google (GOOGLEFINANCE) */}
        <Panel
          title="Integração Planilha Google (GOOGLEFINANCE)"
          subtitle="Atualize cotações do dia, P/VP e dividendos gratuitamente via Google Sheets e envie compras/vendas automaticamente"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                URL do Web App (Google Apps Script `/exec`)
              </label>
              <input
                type="url"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={state.settings.b3SheetApiUrl}
                onChange={(e) => updateSettings({ b3SheetApiUrl: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Link Direto da sua Planilha Google (para botão de atalho)
              </label>
              <input
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={state.settings.googleSpreadsheetUrl}
                onChange={(e) => updateSettings({ googleSpreadsheetUrl: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={syncWithGoogleSheet}
                disabled={isSyncingSheet}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 text-white px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <RefreshCw className={`size-3.5 ${isSyncingSheet ? "animate-spin" : ""}`} />
                Buscar Cotações da Planilha
              </button>
              <button
                onClick={pushAllTickersToGoogleSheet}
                disabled={isSyncingSheet}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              >
                <FileSpreadsheet className="size-3.5" />
                Enviar Ativos p/ Planilha
              </button>
              <button
                onClick={() => setShowScriptCode(!showScriptCode)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-700"
              >
                {showScriptCode ? "Ocultar Código Apps Script" : "Ver Código Apps Script Pronto"}
              </button>
            </div>

            {showScriptCode && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Código Google Apps Script (doGet + doPost com GOOGLEFINANCE)
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
                      toast.success("Código Apps Script copiado para a área de transferência!");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-800 hover:bg-slate-200"
                  >
                    <Copy className="size-3" /> Copiar
                  </button>
                </div>
                <pre className="max-h-56 overflow-auto font-mono text-[11px] text-slate-700">
                  {GOOGLE_APPS_SCRIPT_TEMPLATE}
                </pre>
              </div>
            )}
          </div>
        </Panel>

        {/* 2. Índices Macroeconômicos (CDI, SELIC, IPCA, IGP-M) */}
        <Panel
          title="Parâmetros Macroeconômicos & Indexadores Anuais"
          subtitle="Usados automaticamente no cálculo de Renda Fixa, Tesouro Direto e reajustes de orçamento/aluguel"
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Ano de Referência
              </label>
              <input
                type="number"
                value={state.settings.referenceYear}
                onChange={(e) =>
                  updateSettings({ referenceYear: Number(e.target.value) || 2026 })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                CDI Anual (%)
              </label>
              <input
                type="number"
                step="0.05"
                value={state.settings.cdiAnnual}
                onChange={(e) => updateSettings({ cdiAnnual: Number(e.target.value) || 0 })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                SELIC Anual (%)
              </label>
              <input
                type="number"
                step="0.05"
                value={state.settings.selicAnnual}
                onChange={(e) => updateSettings({ selicAnnual: Number(e.target.value) || 0 })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                IPCA Acumulado (%)
              </label>
              <input
                type="number"
                step="0.05"
                value={state.settings.ipcaAnnual}
                onChange={(e) => updateSettings({ ipcaAnnual: Number(e.target.value) || 0 })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-sky-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                IGP-M Acumulado (%)
              </label>
              <input
                type="number"
                step="0.05"
                value={state.settings.igpmAnnual}
                onChange={(e) => updateSettings({ igpmAnnual: Number(e.target.value) || 0 })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-sky-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Aparência / Tema
              </label>
              <select
                value={state.settings.theme}
                onChange={(e) =>
                  updateSettings({ theme: e.target.value as "dark" | "light" })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="dark">Executive Dark (Obsidian & Gold)</option>
                <option value="light">Editorial Light (Paper & Navy)</option>
              </select>
            </div>
          </div>
        </Panel>

        {/* 3. Cofre Criptografado AES-GCM 256-bit (Backup e Restauração) */}
        <Panel
          title="Cofre Criptografado Local (AES-GCM 256-bit + PBKDF2)"
          subtitle="Exporte e importe backups protegidos por senha com criptografia militar derivada via PBKDF2 (120.000 iterações)"
        >
          <div className="space-y-4">
            <form onSubmit={handleExportEncryptedVault} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Senha para Criptografar Backup
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Digite uma senha forte..."
                    value={vaultPassword}
                    onChange={(e) => setVaultPassword(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 text-white px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <Lock className="size-3.5" />
                    Exportar Cofre AES-256
                  </button>
                </div>
              </div>
            </form>

            <div className="border-t border-slate-200 pt-3">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Restaurar Backup (Cofre Criptografado ou Snapshot JSON)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  placeholder="Senha do arquivo (se criptografado)"
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100">
                  <Upload className="size-3.5" />
                  Selecionar Arquivo JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleExportPlainJson}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                >
                  <Download className="size-3.5" />
                  JSON Simples
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* 4. Sincronização em Nuvem (Supabase Cloud) & Reset Demo */}
        <Panel
          title="Sincronização em Nuvem (Supabase Postgres)"
          subtitle="Conecte seu projeto Supabase para sincronizar seu patrimônio entre múltiplos dispositivos"
        >
          <div className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Supabase Project URL
              </label>
              <input
                type="url"
                placeholder="https://xxxx.supabase.co"
                value={state.settings.supabaseUrl || ""}
                onChange={(e) => updateSettings({ supabaseUrl: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Supabase Publishable / Anon Key
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                value={state.settings.supabaseAnonKey || ""}
                onChange={(e) => updateSettings({ supabaseAnonKey: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex gap-2">
                <button
                  onClick={pushToSupabaseCloud}
                  disabled={isSyncingCloud}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
                >
                  <Cloud className="size-3.5" />
                  Salvar na Nuvem
                </button>
                <button
                  onClick={pullFromSupabaseCloud}
                  disabled={isSyncingCloud}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
                >
                  <Database className="size-3.5" />
                  Restaurar da Nuvem
                </button>
              </div>

              <button
                onClick={resetToDemoSeed}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 hover:bg-rose-500/20"
              >
                <RotateCcw className="size-3.5" />
                Zerar Todos os Lançamentos
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
