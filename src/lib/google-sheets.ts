/**
 * Google Sheets (GOOGLEFINANCE) & Apps Script Integration Engine.
 * Supports reading live quotes, P/VP, dividends, segments, and targets,
 * as well as pushing new tickers and buy/sell orders back to the spreadsheet.
 */

export interface SheetRowNormalized {
  ticker: string;
  quantity: number | null;
  price: number;
  pvp: number | null;
  segment: string | null;
  lastDividend: number | null;
  targetShares: number | null;
  dayChangePct: number | null;
}

const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d,.-]/g, "").replace(",", ".");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function normalizeSheetPayload(raw: unknown): SheetRowNormalized[] {
  let rows: unknown[] = [];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) rows = obj.data;
    else if (Array.isArray(obj.rows)) rows = obj.rows;
    else if (Array.isArray(obj.positions)) rows = obj.positions;
  }

  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => {
      const ticker = String(r["Ticker"] ?? r["ticker"] ?? r["Ativo"] ?? r["ativo"] ?? "")
        .trim()
        .toUpperCase();
      const price =
        parseNum(
          r["Cotação Atual"] ??
            r["cotacaoAtual"] ??
            r["price"] ??
            r["Preco"] ??
            r["Preço"] ??
            r["Cotacao"],
        ) ?? 0;

      return {
        ticker,
        quantity: parseNum(r["Qtd Atual"] ?? r["quantidade"] ?? r["quantity"] ?? r["Qtde"]),
        price,
        pvp: parseNum(r["P/VP"] ?? r["pvp"] ?? r["PVP"]),
        segment:
          typeof (r["Segmento"] ?? r["segment"]) === "string"
            ? String(r["Segmento"] ?? r["segment"]).trim()
            : null,
        lastDividend: parseNum(
          r["Último Div. (R$)"] ??
            r["ultimoDividendo"] ??
            r["lastDividend"] ??
            r["Dividendo"],
        ),
        targetShares: parseNum(r["Cotas Meta"] ?? r["targetShares"] ?? r["Meta Cotas"]),
        dayChangePct: parseNum(r["Variação Dia (%)"] ?? r["variacaoDia"] ?? r["changePct"]),
      };
    })
    .filter((item) => item.ticker.length > 0 && item.price > 0);
}

export async function fetchQuotesFromGoogleSheet(apiUrl: string): Promise<{
  ok: boolean;
  rows: SheetRowNormalized[];
  message: string;
}> {
  if (!apiUrl || !apiUrl.trim()) {
    return {
      ok: false,
      rows: [],
      message: "Configure a URL do Google Apps Script em Configurações > Planilha Google.",
    };
  }

  try {
    const res = await fetch(apiUrl.trim(), { redirect: "follow" });
    if (!res.ok) {
      return {
        ok: false,
        rows: [],
        message: `A planilha respondeu com status HTTP ${res.status}.`,
      };
    }
    const text = await res.text();
    const json = JSON.parse(text);
    const rows = normalizeSheetPayload(json);
    return {
      ok: true,
      rows,
      message: `${rows.length} ativo(s) sincronizados via GOOGLEFINANCE.`,
    };
  } catch (err) {
    return {
      ok: false,
      rows: [],
      message:
        err instanceof Error
          ? `Falha ao ler planilha: ${err.message}`
          : "Não foi possível conectar à planilha Google.",
    };
  }
}

export async function pushTradeOrTickerToGoogleSheet(
  apiUrl: string,
  payload:
    | {
        action: "addTicker";
        ticker: string;
      }
    | {
        action: "upsert";
        ticker: string;
        side: "buy" | "sell";
        quantity: number;
        price: number;
        tradeDate: string;
        newQuantity: number;
      },
): Promise<{ ok: boolean; message: string }> {
  if (!apiUrl || !apiUrl.trim()) {
    return {
      ok: false,
      message: "URL do Apps Script não configurada (salvo localmente).",
    };
  }

  try {
    const res = await fetch(apiUrl.trim(), {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const text = (await res.text()).slice(0, 300);
    if (!res.ok) {
      return {
        ok: false,
        message: `Planilha recusou gravação (${res.status}): ${text}`,
      };
    }
    if (/doPost|not (supported|found)|Script function/i.test(text)) {
      return {
        ok: false,
        message:
          "A planilha não possui doPost(e) configurado no Apps Script. Copie o script pronto na aba Configurações.",
      };
    }
    return { ok: true, message: "Sincronizado com a Planilha Google!" };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Erro ao enviar para planilha: ${err.message}`
          : "Falha de rede ao enviar para a planilha.",
    };
  }
}

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// Cole este código em Extensões > Apps Script na sua Planilha Google
// A aba principal deve conter as colunas:
// Ticker | Qtd Atual | Cotação Atual | P/VP | Segmento | Último Div. (R$) | Cotas Meta
// Na coluna "Cotação Atual" (ex: C2), use a fórmula: =IF(A2="";"";GOOGLEFINANCE("BVMF:"&A2;"price"))

function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    if (row["Ticker"] || row["ticker"]) rows.push(row);
  }
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var payload = JSON.parse(e.postData.contents || "{}");
  var ticker = String(payload.ticker || "").trim().toUpperCase();
  if (!ticker) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Ticker vazio" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var data = sheet.getDataRange().getValues();
  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === ticker) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) {
    var nextRow = sheet.getLastRow() + 1;
    var initQty = payload.newQuantity !== undefined ? payload.newQuantity : (payload.quantity || 0);
    sheet.getRange(nextRow, 1).setValue(ticker);
    sheet.getRange(nextRow, 2).setValue(initQty);
    sheet.getRange(nextRow, 3).setFormula('=IFERROR(GOOGLEFINANCE("BVMF:"&A' + nextRow + ';"price"); 0)');
  } else if (payload.newQuantity !== undefined) {
    sheet.getRange(foundRow, 2).setValue(payload.newQuantity);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, ticker: ticker }))
    .setMimeType(ContentService.MimeType.JSON);
}`;
