import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WealthState } from "../types/wealth";

let cachedClient: SupabaseClient | null = null;
let cachedUrl = "";
let cachedKey = "";

export function getSupabaseClient(url?: string, anonKey?: string): SupabaseClient | null {
  const targetUrl = (url || import.meta.env.VITE_SUPABASE_URL || "").trim();
  const targetKey = (anonKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!targetUrl || !targetKey) return null;

  if (cachedClient && cachedUrl === targetUrl && cachedKey === targetKey) {
    return cachedClient;
  }

  cachedUrl = targetUrl;
  cachedKey = targetKey;
  cachedClient = createClient(targetUrl, targetKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cachedClient;
}

/**
 * Sincroniza o snapshot completo do usuário com a tabela `wealth_snapshots` no Supabase
 * (ou salva por usuário autenticado).
 */
export async function syncWealthStateToSupabase(
  state: WealthState,
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseClient(state.settings.supabaseUrl, state.settings.supabaseAnonKey);
  if (!client) {
    return {
      ok: false,
      message: "Configure a URL e a Anon Key do Supabase na aba Configurações.",
    };
  }

  try {
    const { data: userData } = await client.auth.getUser();
    const userId = userData.user?.id || "default-wealth-profile";

    const { error } = await client.from("wealth_snapshots").upsert(
      {
        user_id: userId,
        payload: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      return {
        ok: false,
        message: `Supabase respondeu: ${error.message}`,
      };
    }

    return {
      ok: true,
      message: "Patrimônio sincronizado na nuvem (Supabase) com sucesso!",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro ao sincronizar com Supabase.",
    };
  }
}

export async function pullWealthStateFromSupabase(
  url?: string,
  anonKey?: string,
): Promise<{ ok: boolean; state: WealthState | null; message: string }> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) {
    return {
      ok: false,
      state: null,
      message: "Configure a URL e a Anon Key do Supabase primeiro.",
    };
  }

  try {
    const { data: userData } = await client.auth.getUser();
    const userId = userData.user?.id || "default-wealth-profile";

    const { data, error } = await client
      .from("wealth_snapshots")
      .select("payload, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return { ok: false, state: null, message: error.message };
    }
    if (!data || !data.payload) {
      return {
        ok: false,
        state: null,
        message: "Nenhum snapshot encontrado no Supabase para este perfil.",
      };
    }

    return {
      ok: true,
      state: data.payload as WealthState,
      message: `Dados restaurados do Supabase (atualizado em ${new Date(data.updated_at).toLocaleString("pt-BR")}).`,
    };
  } catch (err) {
    return {
      ok: false,
      state: null,
      message: err instanceof Error ? err.message : "Erro ao buscar dados do Supabase.",
    };
  }
}
