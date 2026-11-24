import React, { useState } from "react";
import { Eye, EyeOff, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { verifyLoginCredentials, type AuthenticatedUser } from "../lib/auth";

export function LoginGate({
  onAuthenticated,
}: {
  onAuthenticated: (user: AuthenticatedUser) => void;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await verifyLoginCredentials(login, password);
      if (result.ok && result.user) {
        onAuthenticated(result.user);
      } else {
        setError(result.error || "Acesso negado.");
      }
    } catch {
      setError("Erro ao validar credenciais.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4 py-12 text-slate-900">
      <div className="w-full max-w-md">
        {/* Cabeçalho da Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <Sparkles className="size-5" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Acesso Restrito
          </span>
          <h1 className="mt-1 font-serif text-2xl font-bold tracking-tight text-slate-900">
            Patrimônio &amp; Wealth Hub
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Informe suas credenciais para desbloquear seu ambiente financeiro
          </p>
        </div>

        {/* Card de Login */}
        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">
            <div>
              <label
                htmlFor="auth-login"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                Login
              </label>
              <input
                id="auth-login"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-slate-900 focus:outline-none"
                required
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 transition focus:border-slate-900 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700"
                  tabIndex={-1}
                  aria-label="Mostrar ou ocultar senha"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50"
            >
              <Lock className="size-4" />
              {loading ? "Verificando..." : "Entrar"}
            </button>
          </form>
        </div>

        {/* Rodapé de Segurança */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
          <ShieldCheck className="size-3.5 text-slate-400" />
          <span>Autenticação protegida por derivação PBKDF2-SHA256</span>
        </div>
      </div>
    </div>
  );
}
