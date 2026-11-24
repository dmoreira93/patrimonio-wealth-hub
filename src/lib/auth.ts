/**
 * Motor de Autenticação Criptográfica (PBKDF2-SHA256 com 120.000 iterações)
 * e Controle de Sessão Privada.
 * As credenciais padrão são verificadas exclusivamente via hashes criptográficos
 * (zero exposição de senha em texto puro no código-fonte ou no bundle).
 */

const AUTH_SALT = "patrimonio_wealth_hub_v1_salt_93";
const PBKDF2_ITERATIONS = 120_000;
const SESSION_STORAGE_KEY = "patrimonio_wealth_auth_session_v1";
const CUSTOM_CRED_STORAGE_KEY = "patrimonio_wealth_custom_cred_v1";

// Hashes criptográficos pré-computados do titular cadastrado (Diego Moreira)
const DEFAULT_USER_HASH = "bdb76fae51d2f639421eeb49ae77593a35ba76959eecbb4497de4a13c721760f";
const DEFAULT_PWD_HASH = "43f750e8bf56f7422ff9d0e9afc55f4ecdc08172927dcfec46b1517634bd2cf8";
const DEFAULT_DISPLAY_NAME = "Diego Moreira";

export interface AuthenticatedUser {
  username: string;
  displayName: string;
  authenticatedAt: string;
}

interface StoredCustomCredentials {
  displayName: string;
  userHash: string;
  pwdHash: string;
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

async function computeUsernameHash(username: string): Promise<string> {
  const normalized = username.trim().toLowerCase();
  const data = new TextEncoder().encode(`${AUTH_SALT}:${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(digest);
}

async function computePasswordHash(password: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(AUTH_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bufToHex(bits);
}

function getTargetCredentials(): StoredCustomCredentials {
  try {
    const raw = localStorage.getItem(CUSTOM_CRED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredCustomCredentials;
      if (parsed && parsed.userHash && parsed.pwdHash) {
        return parsed;
      }
    }
  } catch {
    // fallback to default
  }
  return {
    displayName: DEFAULT_DISPLAY_NAME,
    userHash: DEFAULT_USER_HASH,
    pwdHash: DEFAULT_PWD_HASH,
  };
}

export async function verifyLoginCredentials(
  usernameInput: string,
  passwordInput: string,
): Promise<{ ok: boolean; user?: AuthenticatedUser; error?: string }> {
  const cleanUser = usernameInput.trim().toLowerCase();
  const cleanPwd = passwordInput;

  if (!cleanUser || !cleanPwd) {
    return { ok: false, error: "Informe seu login e sua senha." };
  }

  const [inputUserHash, inputPwdHash] = await Promise.all([
    computeUsernameHash(cleanUser),
    computePasswordHash(cleanPwd),
  ]);

  const target = getTargetCredentials();

  if (inputUserHash === target.userHash && inputPwdHash === target.pwdHash) {
    const sessionUser: AuthenticatedUser = {
      username: cleanUser,
      displayName: target.displayName || DEFAULT_DISPLAY_NAME,
      authenticatedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
    return { ok: true, user: sessionUser };
  }

  return { ok: false, error: "Credenciais inválidas. Verifique seu login e senha." };
}

export function getActiveSessionUser(): AuthenticatedUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthenticatedUser;
    if (parsed && parsed.username && parsed.displayName) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearActiveSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function updateAccountPassword(
  currentPassword: string,
  newLogin: string,
  newPassword: string,
  newDisplayName: string,
): Promise<{ ok: boolean; message: string }> {
  const target = getTargetCredentials();
  const currentHash = await computePasswordHash(currentPassword);

  if (currentHash !== target.pwdHash) {
    return { ok: false, message: "A senha atual informada está incorreta." };
  }
  if (!newLogin.trim() || newPassword.length < 4) {
    return {
      ok: false,
      message: "O novo login não pode ser vazio e a nova senha deve ter ao menos 4 caracteres.",
    };
  }

  const [userHash, pwdHash] = await Promise.all([
    computeUsernameHash(newLogin),
    computePasswordHash(newPassword),
  ]);

  const updated: StoredCustomCredentials = {
    displayName: newDisplayName.trim() || DEFAULT_DISPLAY_NAME,
    userHash,
    pwdHash,
  };

  localStorage.setItem(CUSTOM_CRED_STORAGE_KEY, JSON.stringify(updated));
  return { ok: true, message: "Credenciais de acesso atualizadas com sucesso!" };
}
