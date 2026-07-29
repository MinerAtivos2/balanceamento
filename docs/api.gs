/*
  B3 Rebalanceamento & IA — Google Apps Script API
  Este script atua como o backend para o projeto hospedado no GitHub Pages.

  COMO INSTALAR:
  1. Crie uma nova Planilha Google (Google Sheet).
  2. No menu superior, vá em "Extensões" > "Apps Script".
  3. Apague todo o código existente e cole este conteúdo.
  4. Clique no ícone de disquete (Salvar) e dê o nome de "B3-Backend".
  5. Clique em "Implantar" > "Nova implantação".
  6. Selecione o tipo "App da Web".
  7. Em "Executar como", selecione "Eu".
  8. Em "Quem tem acesso", selecione "Qualquer pessoa" (isso é necessário para o GitHub Pages acessar).
  9. Clique em "Implantar", autorize o acesso e COPIE a "URL do app da Web".
  10. Cole essa URL no arquivo 'app.js' do seu projeto no GitHub.

  ESTRUTURA DA PLANILHA (Crie 3 abas com estes nomes):
  - Users: [id, username, password, is_admin]
  - Portfolios: [user_id, data, updated_at]
  - Leads: [email, timestamp]
*/

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doPost(e) {
  const result = processRequest(e);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // O doGet é útil para testes simples, mas o app usará doPost para segurança de dados
  return ContentService.createTextOutput(JSON.stringify({ status: "API Online", message: "Use POST para interagir com a API." }))
    .setMimeType(ContentService.MimeType.JSON);
}

function processRequest(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return { error: "Dados inválidos" };
  }

  const action = data.action;

  if (action === "login") {
    return handleLogin(data.username, data.password);
  } else if (action === "add_lead") {
    return handleAddLead(data.email);
  } else if (action === "get_portfolio") {
    return handleGetPortfolio(data.username, data.session_token);
  } else if (action === "save_portfolio") {
    return handleSavePortfolio(data.username, data.session_token, data.portfolio);
  } else if (action === "update_password") {
    return handleUpdatePassword(data.username, data.old_password, data.new_password);
  } else if (action === "status") {
    return handleStatus(data.username, data.session_token);
  } else if (action === "status_and_portfolio") {
    return handleStatusAndPortfolio(data.username, data.session_token);
  } else if (action === "get_all_tickers") {
    return handleGetAllTickers();
  } else if (action === "request_rebalance") {
    return handleRequestRebalance(data.username, data.session_token, data.params, data.portfolio);
  } else if (action === "get_live_prices") {
    return handleGetLivePrices(data.tickers);
  } else if (action === "get_tax_config") {
    return handleGetTaxConfig();
  } else if (action === "get_fiscal_data") {
    return handleGetFiscalData(data.username, data.session_token);
  } else if (action === "save_fiscal_data") {
    return handleSaveFiscalData(data.username, data.session_token, data.fiscal_data);
  }

  return { error: "Ação não reconhecida: " + action };
}

// --- Funções de Banco de Dados (Sheets) ---

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function findUser(username) {
  const sheet = getSheet("Users");
  const data = sheet.getDataRange().getValues();
  // Pular cabeçalho na linha 0
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === username) {
      return {
        id: data[i][0],
        username: data[i][1],
        password: data[i][2],
        is_admin: data[i][3] == 1 || data[i][3] === true || data[i][3] === "1"
      };
    }
  }
  return null;
}

// --- Handlers ---

function handleLogin(username, password) {
  const user = findUser(username);
  if (user && String(user.password) === String(password)) {
    // Para simplificar no GAS, usamos o próprio username como token básico (em produção usaríamos algo mais forte)
    const token = Utilities.base64Encode(username + ":" + new Date().getTime());
    return {
      success: true,
      username: user.username,
      is_admin: user.is_admin,
      session_token: token
    };
  }
  return { error: "Usuário ou senha inválidos" };
}

function handleStatus(username, token) {
  if (!username || !token) return { logged_in: false };
  const user = findUser(username);
  if (user) {
    return { logged_in: true, username: user.username, is_admin: user.is_admin };
  }
  return { logged_in: false };
}

function handleStatusAndPortfolio(username, token) {
  if (!username || !token) return { logged_in: false };
  const user = findUser(username);
  if (user) {
    const portfolio = handleGetPortfolio(username, token);
    return {
      logged_in: true,
      username: user.username,
      is_admin: user.is_admin,
      portfolio: portfolio
    };
  }
  return { logged_in: false };
}

function handleAddLead(email) {
  if (!email) return { error: "E-mail obrigatório" };
  const sheet = getSheet("Leads");
  sheet.appendRow([email, new Date().toISOString()]);
  return { success: true, message: "Lead cadastrado com sucesso" };
}

function handleGetPortfolio(username, token) {
  const user = findUser(username);
  if (!user) return { error: "Não autorizado" };

  const sheet = getSheet("Portfolios");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == user.id) {
      return JSON.parse(data[i][1]);
    }
  }
  return { name: "Meu Portfólio", positions: [], is_new: true };
}

function handleSavePortfolio(username, token, portfolio) {
  const user = findUser(username);
  if (!user) return { error: "Não autorizado" };

  const sheet = getSheet("Portfolios");
  const data = sheet.getDataRange().getValues();
  const portfolioStr = JSON.stringify(portfolio);
  const now = new Date().toISOString();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == user.id) {
      sheet.getRange(i + 1, 2).setValue(portfolioStr);
      sheet.getRange(i + 1, 3).setValue(now);
      return { success: true };
    }
  }

  // Se não existir, adiciona novo
  sheet.appendRow([user.id, portfolioStr, now]);
  return { success: true };
}

function handleGetAllTickers() {
  const sheet = getSheet("Portfolios");
  const data = sheet.getDataRange().getValues();
  const tickers = new Set();
  for (let i = 1; i < data.length; i++) {
    try {
      const portfolio = JSON.parse(data[i][1]);
      if (portfolio.positions) {
        portfolio.positions.forEach(p => {
          if (p.ticker) tickers.add(p.ticker);
        });
      }
    } catch (e) {}
  }
  return { success: true, tickers: Array.from(tickers) };
}

function handleGetLivePrices(tickers) {
  if (!tickers || !tickers.length) return {};
  const lock = LockService.getScriptLock();
  try {
    // Adquire um bloqueio exclusivo de até 30 segundos para evitar concorrência na mesma folha
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName("LivePricesEval");
    if (!sheet) {
      sheet = ss.insertSheet("LivePricesEval");
    } else {
      sheet.clearContents();
    }

    const formulas = [];
    for (let i = 0; i < tickers.length; i++) {
      const cleanTicker = tickers[i].toUpperCase().replace(".SA", "");
      formulas.push(["=GOOGLEFINANCE(\"" + cleanTicker + "\")"]);
    }

    sheet.getRange(1, 1, formulas.length, 1).setFormulas(formulas);
    SpreadsheetApp.flush();

    const values = sheet.getRange(1, 1, formulas.length, 1).getValues();
    const results = {};
    for (let i = 0; i < tickers.length; i++) {
      const val = values[i][0];
      if (val != null && typeof val === "number" && !isNaN(val) && val > 0) {
        results[tickers[i]] = val;
      }
    }

    // Limpa para evitar lixo acumulado
    sheet.clearContents();
    return results;
  } catch (err) {
    return { error: err.toString() };
  } finally {
    // Libera o bloqueio exclusivo
    lock.releaseLock();
  }
}

function handleGetTaxConfig() {
  try {
    const sheet = getSheet("TaxConfig");
    if (!sheet) {
      return {
        STOCK_EXEMPTION_LIMIT: 20000,
        STOCK_ST_RATE: 0.15,
        STOCK_DT_RATE: 0.20,
        FII_RATE: 0.20
      };
    }
    const data = sheet.getDataRange().getValues();
    const config = {};
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        config[data[i][0]] = data[i][1];
      }
    }
    return config;
  } catch (e) {
    return {
      STOCK_EXEMPTION_LIMIT: 20000,
      STOCK_ST_RATE: 0.15,
      STOCK_DT_RATE: 0.20,
      FII_RATE: 0.20
    };
  }
}

function handleGetFiscalData(username, token) {
  const user = findUser(username);
  if (!user) return { error: "Não autorizado" };

  try {
    const sheet = getSheet("FiscalData");
    if (!sheet) {
      return { dt_loss: 0, st_loss: 0, irrf_balance: 0, tax_balance: 0 };
    }
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == user.id) {
        return {
          dt_loss: data[i][1] || 0,
          st_loss: data[i][2] || 0,
          irrf_balance: data[i][3] || 0,
          tax_balance: data[i][4] || 0
        };
      }
    }
  } catch (e) {}
  return { dt_loss: 0, st_loss: 0, irrf_balance: 0, tax_balance: 0 };
}

function handleSaveFiscalData(username, token, fiscal_data) {
  const user = findUser(username);
  if (!user) return { error: "Não autorizado" };

  try {
    const sheet = getSheet("FiscalData");
    if (!sheet) {
      // Tenta criar
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      ss.insertSheet("FiscalData");
      const newSheet = ss.getSheetByName("FiscalData");
      newSheet.appendRow(["User ID", "DT Loss", "ST Loss", "IRRF Balance", "Tax Balance", "Updated At"]);
    }

    const finalSheet = getSheet("FiscalData");
    const data = finalSheet.getDataRange().getValues();
    const now = new Date().toISOString();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == user.id) {
        finalSheet.getRange(i + 1, 2).setValue(fiscal_data.dt_loss || 0);
        finalSheet.getRange(i + 1, 3).setValue(fiscal_data.st_loss || 0);
        finalSheet.getRange(i + 1, 4).setValue(fiscal_data.irrf_balance || 0);
        finalSheet.getRange(i + 1, 5).setValue(fiscal_data.tax_balance || 0);
        finalSheet.getRange(i + 1, 6).setValue(now);
        return { success: true };
      }
    }

    finalSheet.appendRow([
      user.id,
      fiscal_data.dt_loss || 0,
      fiscal_data.st_loss || 0,
      fiscal_data.irrf_balance || 0,
      fiscal_data.tax_balance || 0,
      now
    ]);
    return { success: true };
  } catch (e) {
    return { error: e.toString() };
  }
}

function handleRequestRebalance(username, token, params, portfolio) {
  const user = findUser(username);
  if (!user) return { error: "Não autorizado" };

  const sheet = getSheet("RebalanceRequests");
  if (!sheet) {
    // Tenta criar a aba se não existir
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      ss.insertSheet("RebalanceRequests");
      const newSheet = ss.getSheetByName("RebalanceRequests");
      newSheet.appendRow(["Timestamp", "User ID", "Username", "Strategy", "Max Weight", "Period", "Risk Free", "Portfolio JSON"]);
    } catch (e) {
      return { error: "Erro ao acessar base de dados de solicitações." };
    }
  }

  const finalSheet = getSheet("RebalanceRequests");
  finalSheet.appendRow([
    new Date().toISOString(),
    user.id,
    username,
    params.strategy,
    params.max_weight,
    params.period_months,
    params.risk_free,
    JSON.stringify(portfolio)
  ]);

  return { success: true };
}

function handleUpdatePassword(username, oldPassword, newPassword) {
  const sheet = getSheet("Users");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === username) {
      if (String(data[i][2]) === String(oldPassword)) {
        sheet.getRange(i + 1, 3).setValue(newPassword);
        return { success: true, message: "Senha alterada com sucesso!" };
      } else {
        return { error: "Senha atual incorreta." };
      }
    }
  }
  return { error: "Usuário não encontrado." };
}
