# Patrimônio & Wealth Hub — Gestão Financeira Pessoal e Investimentos

Plataforma unificada que consolida e evolui os projetos **ControleInvestimentos** e **my-love-finances** em uma arquitetura moderna, híbrida (Supabase Cloud + Cofre Criptografado Local AES-GCM 256-bit + Planilha Google `GOOGLEFINANCE`).

## Principais Módulos Unificados

1. **Cartões de Crédito & Acompanhamento de Faturas**:
   - Cadastro de múltiplos cartões com limite, dia de fechamento e dia de vencimento.
   - Lançamento de gastos **À Vista (1x)**, **Parcelados ($N\times$, com divisão exata de centavos sem erro de arredondamento)** e **Assinaturas Recorrentes**.
   - Navegador de faturas mês a mês, baixa de pagamento de fatura e matriz de projeção para os próximos 12 meses.

2. **Ações, FIIs, ETFs, Ordens & Proventos (Integração `GOOGLEFINANCE`)**:
   - Registro de compras e vendas com cálculo automático de **Preço Médio Ponderado** e lucro realizado.
   - Lançamento de **Dividendos, JCP e Rendimentos de FIIs**, apurando a **Rentabilidade Real Total** (Valorização da cota + Proventos no bolso).
   - Sincronização bidirecional via **Google Apps Script + `GOOGLEFINANCE`**: busca cotações do dia, P/VP e último dividendo, e envia novas ordens/tickers para a planilha.
   - **Número Mágico (Efeito Bola de Neve)** e Simulador Inteligente **"Onde Aportar"** baseado em score ponderado (Desconto P/VP, Dividend Yield e proximidade do Número Mágico).

3. **Acompanhamento de Todos os Investimentos & Perspectiva Patrimonial**:
   - **Renda Fixa & Tesouro Direto** (`Tesouro Selic`, `Tesouro IPCA+`, `Tesouro Prefixado`, `CDB`, `LCI`, `LCA`, `CRI`, `CRA`, `Debêntures`): cálculo diário pela curva (`% CDI`, `% SELIC`, `IPCA + Spread`, `Pré`) com desconto automático da **Tabela Regressiva de IR** (22,5% a 15%) ou isenção fiscal.
   - **Fundos de Investimento & Previdência** (`Multimercado`, `PGBL/VGBL`, `Renda Fixa`, `Cambial`).
   - **Simulador de Perspectiva Patrimonial**: projeção composta multi-anos (1 a 15 anos) em 3 cenários (Conservador, Base e Otimista) estimando a renda passiva mensal futura.

4. **Financiamentos, Empréstimos & Dívidas (Baixa de Parcelas e Antecipação)**:
   - Suporte a **Tabela Price**, **Sistema SAC** e **Parcelas Fixas**.
   - Cronograma completo com botão de **Baixar Parcela** (data efetiva e valor pago) e opção de desfazer baixa.
   - **Simulador e Executor de Antecipação com Desconto**: selecione múltiplas parcelas futuras para amortizar e visualize instantaneamente os juros economizados.

5. **Orçamento Anual (Orçado × Projetado × Realizado), Folha (Bruto → Líquido), Aluguéis & Metas**:
   - Decomposição de salário bruto com deduções de folha (INSS, IRRF, Saúde) e reajuste automático por **IPCA** ou **IGP-M**.
   - Gestão de **Aluguéis** (Locador/Locatário) com **FCI (Fundo de Conservação)** e **Caução corrigida pela poupança**.
   - **Cofre Criptografado AES-GCM 256-bit (PBKDF2)** e sincronização em nuvem com **Supabase**.

## Como Executar

```bash
npm install
npm run dev
```
