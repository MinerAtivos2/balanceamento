/* ==========================================================================
   B3 Rebalanceamento & IA — Frontend Application (100% Client-Side)
   ========================================================================== */

class B3App {
  constructor() {
    // --- CONFIGURAÇÃO GOOGLE SHEETS / APPS SCRIPT ---
    this.GAS_URL = "https://script.google.com/macros/s/AKfycbxJtX1FkpmSw-y1MB3B3OUBzFTdB-7AhYMJK8kryYm0IogCVHzv3bt3K-t6XYUZrBw/exec";

    this.portfolio = { name: 'Meu Portfólio', positions: [] };
    this.user = null; // { username: '...' } if logged in
    this.assets = [];
    this.marketData = null;
    this.analysis = null;
    this.charts = {};
    this.dividends = [];
    this.dividendFilterOnlyMine = true;
    this.init();
  }

  /* ------------------------------------------------------------------
     Initialisation
  ------------------------------------------------------------------ */
  async init() {
    this.bindUI();
    this.setupNavigation();
    this.setupModal();
    this.setupAuth();

    await this.checkAuthStatus();
    await this.loadMarketData();
    await this.loadMarketSummary();
    await this.loadAssets();
    await this.loadPortfolio();
    await this.runAnalysis();
    await this.loadDividends(); // <--- NOVO

    this.renderPositions();
  }

  bindUI() {
    // Buttons
    this.$('btnAddPosition').addEventListener('click', () => this.openModal());
    this.$('btnAnalyze').addEventListener('click', () => this.runAnalysis());
    this.$('btnRunBarsi').addEventListener('click', () => this.runBarsi());
    this.$('btnRunRebalance').addEventListener('click', () => this.runRebalance());
    this.$('btnAddBulk').addEventListener('click', () => this.openBulkModal());

    // Mobile
    this.$('hamburger').addEventListener('click', () => this.toggleSidebar());
    this.$('overlay').addEventListener('click', () => this.toggleSidebar(false));

    // Auth buttons
    this.$('btnLogout').addEventListener('click', (e) => { e.preventDefault(); this.logout(); });
    this.$('btnLogoutFull').addEventListener('click', () => this.logout());

    // Sort listeners
    this.$('sortPositions').addEventListener('change', () => this.renderPositions());
    this.$('sortBarsi').addEventListener('change', () => this.renderBarsi());
    this.$('sortRebalance').addEventListener('change', () => this.renderRebalance());
    this.$('sortDividends').addEventListener('change', () => this.renderDividends());

    // Membership modal
    this.$('membershipModalClose').addEventListener('click', () => this.closeMembershipModal());
    this.$('membershipModalOverlay').addEventListener('click', e => {
      if (e.target === this.$('membershipModalOverlay')) this.closeMembershipModal();
    });
    this.$('leadForm').addEventListener('submit', (e) => this.handleLeadSubmit(e));

    // Ticker input validation
    this.$('posTicker').addEventListener('input', () => this.validateTicker());

    // Dividends filtering (NOVO)
    this.$('btnFilterMyDividends').addEventListener('click', () => this.renderDividends(true));
    this.$('btnFilterAllDividends').addEventListener('click', () => this.renderDividends(false));
  }

  $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------
     Navigation
  ------------------------------------------------------------------ */
  setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const section = link.dataset.section;
        this.showPage(section);
        this.toggleSidebar(false);
      });
    });
  }

  showPage(name) {
    console.log('Showing page:', name);
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.querySelector(`[data-page="${name}"]`);
    if (page) {
      page.classList.add('active');
    } else {
      console.warn('Page not found:', name);
    }

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const link = document.querySelector(`.nav-link[data-section="${name}"]`);
    if (link) link.classList.add('active');
  }

  toggleSidebar(force) {
    const sidebar = this.$('sidebar');
    const overlay = this.$('overlay');
    const open = force !== undefined ? force : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', open);
    overlay.classList.toggle('show', open);
  }

  /* ------------------------------------------------------------------
     Authentication & Server Sync
  ------------------------------------------------------------------ */
  setupAuth() {
    this.$('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = this.$('loginUsername').value;
      const password = this.$('loginPassword').value;
      await this.login(username, password);
    });

    this.$('changePasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldPassword = this.$('oldPassword').value;
      const newPassword = this.$('newPassword').value;
      await this.changePassword(oldPassword, newPassword);
    });
  }

  async checkAuthStatus() {
    if (!this.GAS_URL) {
      console.log('Google Apps Script URL não configurada. Usando modo local.');
      this.user = null;
      this.updateAuthUI(null);
      return;
    }

    const savedUser = localStorage.getItem('b3_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      try {
        const res = await fetch(this.GAS_URL, {
          method: 'POST',
          mode: 'cors',
          body: JSON.stringify({
            action: 'status',
            username: user.username,
            session_token: user.session_token
          })
        });
        const data = await res.json();
        if (data.logged_in) {
          this.user = { ...user, is_admin: !!data.is_admin };
          this.updateAuthUI(data);
        } else {
          this.logout();
        }
      } catch (err) {
        console.warn('Erro ao verificar status no sistema:', err);
      }
    }
  }

  async login(username, password) {
    if (!this.GAS_URL) {
      this.toast('Configure a GAS_URL no app.js para habilitar o login.', 'warning');
      return;
    }

    this.showLoading('Entrando...');
    try {
      const res = await fetch(this.GAS_URL, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify({ action: 'login', username, password })
      });
      const data = await res.json();
      this.hideLoading();

      if (data.success) {
        this.user = {
          username: data.username,
          is_admin: !!data.is_admin,
          session_token: data.session_token
        };
        localStorage.setItem('b3_user', JSON.stringify(this.user));

        this.toast(`Bem-vindo, ${data.username}!`, 'success');
        this.updateAuthUI(data);

        // Load server portfolio first
        const serverData = await this.loadPortfolioFromServer();

        // Migration logic: Only migrate if server portfolio is empty
        if (serverData.is_new || (serverData.positions && serverData.positions.length === 0)) {
          const local = localStorage.getItem('b3_portfolio');
          if (local) {
            const localPortfolio = JSON.parse(local);
            if (localPortfolio.positions && localPortfolio.positions.length > 0) {
              this.toast('Sincronizando seu portfólio local para a nuvem...', 'info');
              this.portfolio = localPortfolio;
              await this.savePortfolioServer();
            } else {
              this.portfolio = serverData;
            }
          } else {
            this.portfolio = serverData;
          }
        } else {
          this.portfolio = serverData;
        }

        await this.runAnalysis();
        this.renderPositions();
        this.showPage('dashboard');
      } else {
        this.toast(data.error || 'Erro no login', 'error');
      }
    } catch (err) {
      this.hideLoading();
      this.toast('Falha na comunicação com o sistema.', 'error');
    }
  }

  async logout() {
    this.showLoading('Saindo...');
    try {
      localStorage.removeItem('b3_user');
      this.user = null;
      this.updateAuthUI(false);

      // Restore local portfolio after logout
      const local = localStorage.getItem('b3_portfolio');
      if (local) {
        this.portfolio = JSON.parse(local);
      } else {
        this.portfolio = { name: 'Meu Portfólio', positions: [] };
      }

      this.hideLoading();
      this.toast('Você saiu com sucesso', 'info');

      await this.runAnalysis();
      this.renderPositions();
      this.showPage('dashboard');
    } catch (err) {
      this.hideLoading();
    }
  }

  async changePassword(old_password, new_password) {
    if (!this.GAS_URL) {
      this.toast('Configuração do servidor não encontrada.', 'error');
      return;
    }

    try {
      this.showLoading('Atualizando senha...');
      const response = await fetch(this.GAS_URL, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify({
          action: 'update_password',
          username: this.user.username,
          old_password,
          new_password
        })
      });

      const result = await response.json();
      this.hideLoading();

      if (result.success) {
        this.toast(result.message || 'Senha alterada com sucesso!', 'success');
        this.$('changePasswordForm').reset();
      } else {
        this.toast(result.error || 'Erro ao alterar senha.', 'error');
      }
    } catch (error) {
      this.hideLoading();
      console.error('Update password error:', error);
      this.toast('Erro na comunicação com o servidor.', 'error');
    }
  }

  updateAuthUI(data) {
    console.log('Updating Auth UI:', data);
    const loggedIn = data && (data.logged_in || data.username);
    if (loggedIn) {
      this.$('userProfile').style.display = 'flex';
      this.$('sidebarUserName').textContent = this.user.username;

      this.$('loginArea').classList.add('hidden');
      this.$('memberDashboard').classList.remove('hidden');
      this.$('memberDashboard').style.display = 'block';

      this.$('memberWelcomeName').textContent = this.user.username;
      this.$('nav-members').innerHTML = '<span class="nav-icon">👤</span> Perfil';
      this.$('nav-dividends').style.display = 'flex'; // Exibe o calendário

      // Admin Panel
      if (this.user.is_admin) {
        this.$('adminPanel').classList.remove('hidden');
        this.$('adminPanel').style.display = 'block';
        this.$('adminUsersTableCard').style.display = 'none';
      } else {
        this.$('adminPanel').classList.add('hidden');
      }
    } else {
      this.$('userProfile').style.display = 'none';
      this.$('loginArea').classList.remove('hidden');
      this.$('loginArea').style.display = 'block';
      this.$('memberDashboard').classList.add('hidden');
      this.$('adminPanel').classList.add('hidden');
      this.$('nav-members').innerHTML = '<span class="nav-icon">👤</span> Área de Membros';
      this.$('nav-dividends').style.display = 'none'; // Oculta o calendário

      // Se estiver na página de dividendos, volta pro dashboard
      if (document.querySelector('[data-page="dividends"]').classList.contains('active')) {
        this.showPage('dashboard');
      }
    }
  }

  async savePortfolioServer() {
    if (!this.user || !this.GAS_URL) return;
    try {
      await fetch(this.GAS_URL, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify({
          action: 'save_portfolio',
          username: this.user.username,
          session_token: this.user.session_token,
          portfolio: this.portfolio
        })
      });
    } catch (err) {
      console.error('Erro ao salvar os dados:', err);
      this.toast('Erro ao sincronizar dados com o sistema', 'warning');
    }
  }

  async loadPortfolioFromServer() {
    if (!this.user || !this.GAS_URL) return { name: 'Meu Portfólio', positions: [], is_new: true };
    try {
      const res = await fetch(this.GAS_URL, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify({
          action: 'get_portfolio',
          username: this.user.username,
          session_token: this.user.session_token
        })
      });
      return await res.json();
    } catch (err) {
      console.warn('Erro ao carregar do sistema:', err);
      return { name: 'Meu Portfólio', positions: [], is_new: true };
    }
  }

  /* ------------------------------------------------------------------
     Modal
  ------------------------------------------------------------------ */
  setupModal() {
    this.$('modalClose').addEventListener('click', () => this.closeModal());
    this.$('modalCancel').addEventListener('click', () => this.closeModal());
    this.$('positionForm').addEventListener('submit', e => {
      e.preventDefault();
      this.savePosition();
    });
    this.$('modalOverlay').addEventListener('click', e => {
      if (e.target === this.$('modalOverlay')) this.closeModal();
    });

    // Bulk Modal
    this.$('bulkModalClose').addEventListener('click', () => this.closeBulkModal());
    this.$('bulkModalCancel').addEventListener('click', () => this.closeBulkModal());
    this.$('btnBulkAddRow').addEventListener('click', () => this.addBulkRow());
    this.$('btnBulkSave').addEventListener('click', () => this.saveBulkPositions());
    this.$('bulkModalOverlay').addEventListener('click', e => {
      if (e.target === this.$('bulkModalOverlay')) this.closeBulkModal();
    });
  }

  openModal(editIndex = null) {
    if (!this.user && editIndex === null) {
      const uniqueTickers = new Set(this.portfolio.positions.map(p => p.ticker));
      if (uniqueTickers.size >= 5) {
        this.openMembershipModal();
        return;
      }
    }

    this.editIndex = editIndex;
    this.$('modalTitle').textContent = editIndex !== null ? 'Editar Registro' : 'Adicionar Ativo';

    if (this.$('assetList').children.length === 0 && this.assets.length > 0) {
      this.populateAssetDatalist();
    }

    const tickerInput = this.$('posTicker');
    tickerInput.value = '';
    this.$('tickerWarning').style.display = 'none';

    if (editIndex !== null && this.portfolio.positions[editIndex]) {
      const pos = this.portfolio.positions[editIndex];
      tickerInput.value = pos.ticker;
      this.$('posQty').value = pos.quantity;
      this.$('posPrice').value = pos.purchase_price;
      this.$('posDate').value = pos.purchase_date || new Date().toISOString().slice(0, 10);
    } else {
      this.$('posQty').value = '';
      this.$('posPrice').value = '';
      this.$('posDate').value = new Date().toISOString().slice(0, 10);
    }

    this.$('modalOverlay').classList.add('show');
  }

  validateTicker() {
    const val = this.$('posTicker').value.toUpperCase();
    if (!val) {
      this.$('tickerWarning').style.display = 'none';
      return;
    }
    const found = this.assets.find(a => a.ticker === val || a.ticker.replace('.SA', '') === val);
    if (!found) {
      this.$('tickerWarning').style.display = 'block';
    } else {
      this.$('tickerWarning').style.display = 'none';
    }
  }

  openMembershipModal() {
    this.$('membershipModalOverlay').classList.add('show');
  }

  closeMembershipModal() {
    this.$('membershipModalOverlay').classList.remove('show');
  }

  async handleLeadSubmit(e) {
    e.preventDefault();
    const email = this.$('leadEmail').value;
    if (!this.GAS_URL) {
      this.toast('Configure a GAS_URL no app.js para capturar leads.', 'warning');
      return;
    }
    this.showLoading('Enviando...');
    try {
      const res = await fetch(this.GAS_URL, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify({ action: 'add_lead', email })
      });
      const data = await res.json();
      this.hideLoading();
      if (data.success) {
        this.toast('Obrigado! Entraremos em contato em breve para a realização do seu cadastro.', 'success');
        this.closeMembershipModal();
        this.$('leadForm').reset();
      } else {
        this.toast('Erro ao salvar lead no sistema.', 'error');
      }
    } catch (err) {
      this.hideLoading();
      this.toast('Falha na comunicação com o sistema', 'error');
    }
  }

  closeModal() {
    this.$('modalOverlay').classList.remove('show');
    this.editIndex = null;
  }

  openBulkModal() {
    const tbody = this.$('bulkTableBody');
    tbody.innerHTML = '';
    this.addBulkRow();
    this.$('bulkModalOverlay').classList.add('show');
  }

  closeBulkModal() {
    this.$('bulkModalOverlay').classList.remove('show');
  }

  addBulkRow() {
    const tbody = this.$('bulkTableBody');
    const tr = document.createElement('tr');
    let options = '<option value="">Selecione...</option>';
    this.assets.forEach(a => { options += `<option value="${a.ticker}">${a.ticker}</option>`; });
    const today = new Date().toISOString().slice(0, 10);
    tr.innerHTML = `
      <td><select class="bulk-ticker" style="width: 100%">${options}</select></td>
      <td><input type="number" class="bulk-qty" min="1" placeholder="Qtd" style="width: 100%"></td>
      <td><input type="number" class="bulk-price" min="0" step="0.01" placeholder="Preço" style="width: 100%"></td>
      <td><input type="date" class="bulk-date" value="${today}" style="width: 100%"></td>
      <td><button class="btn-danger-sm" onclick="this.closest('tr').remove()">🗑</button></td>
    `;
    tbody.appendChild(tr);
  }

  async saveBulkPositions() {
    const rows = document.querySelectorAll('#bulkTableBody tr');
    const newPositions = [];
    if (!this.user) {
      const currentTickers = new Set(this.portfolio.positions.map(p => p.ticker));
      const incomingTickers = new Set();
      for (const row of rows) {
        const t = row.querySelector('.bulk-ticker').value;
        if (t) incomingTickers.add(t);
      }
      const combined = new Set([...currentTickers, ...incomingTickers]);
      if (combined.size > 5) {
        this.toast('Limite de 5 ativos atingido para não-membros', 'warning');
        this.openMembershipModal();
        return;
      }
    }
    for (const row of rows) {
      const ticker = row.querySelector('.bulk-ticker').value;
      const qty = parseInt(row.querySelector('.bulk-qty').value, 10);
      const price = parseFloat(row.querySelector('.bulk-price').value);
      const date = row.querySelector('.bulk-date').value;
      if (ticker && !isNaN(qty) && !isNaN(price)) {
        newPositions.push({ ticker, quantity: qty, purchase_price: price, purchase_date: date || new Date().toISOString().slice(0, 10) });
      }
    }
    if (newPositions.length === 0) {
      this.toast('Nenhum dado válido para salvar', 'error');
      return;
    }
    this.portfolio.positions.push(...newPositions);
    this.closeBulkModal();
    this.savePortfolio();
    await this.runAnalysis();
    this.renderPositions();
    this.toast(`${newPositions.length} ativos adicionados!`, 'success');
  }

  /* ------------------------------------------------------------------
     Data loading
  ------------------------------------------------------------------ */
  async loadMarketData() {
    try {
      const url = `./data/market_data.json?t=${new Date().getTime()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Falha ao carregar arquivo (Status: ${res.status})`);
      this.marketData = await res.json();
      console.log('Dados de mercado carregados com sucesso');
    } catch (err) {
      console.error('Erro ao carregar dados de mercado:', err);
      this.toast('Erro ao carregar dados históricos: ' + err.message, 'error');
    }
  }

  async loadMarketSummary() {
    try {
      const url = `./data/market_summary.json?t=${new Date().getTime()}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const summary = await res.json();
      this.renderMarketSummary(summary);
      if (summary.all_assets) this.renderMarketTreemap(summary.all_assets);
    } catch (err) {
      console.warn('Resumo de mercado não disponível');
    }
  }

  async loadAssets() {
    try {
      const res = await fetch('./assets.json');
      if (!res.ok) throw new Error();
      const data = await res.json();
      this.assets = data.assets || [];
      this.populateAssetDatalist();
    } catch {
      console.warn('Falha ao carregar assets.json');
      this.assets = [];
    }
  }

  async loadDividends() {
    try {
      const res = await fetch(`./data/dividends_calendar.json?t=${new Date().getTime()}`);
      if (res.ok) {
        this.dividends = await res.json();
        this.renderDividends(true);
      }
    } catch (err) {
      console.warn('Dividends data not available');
    }
  }

  populateAssetDatalist() {
    const datalist = this.$('assetList');
    if (!datalist) return;
    datalist.innerHTML = '';
    this.assets.forEach(a => {
      const option = document.createElement('option');
      option.value = a.ticker;
      option.textContent = `${a.ticker} — ${a.name}`;
      datalist.appendChild(option);
    });
  }

  async loadPortfolio() {
    if (this.user) {
      const serverData = await this.loadPortfolioFromServer();
      if (serverData && !serverData.error) {
        this.portfolio = serverData;
        return;
      }
    }
    const saved = localStorage.getItem('b3_portfolio');
    if (saved) {
      try { this.portfolio = JSON.parse(saved); } catch { this.portfolio = { name: 'Meu Portfólio', positions: [] }; }
    } else {
      try {
        const res = await fetch('./sample_portfolio.json');
        if (res.ok) { this.portfolio = await res.json(); this.savePortfolio(); }
      } catch { this.portfolio = { name: 'Meu Portfólio', positions: [] }; }
    }
  }

  savePortfolio() {
    if (this.user) this.savePortfolioServer();
    else localStorage.setItem('b3_portfolio', JSON.stringify(this.portfolio));
  }

  consolidatePortfolio() {
    const consolidated = {};
    this.portfolio.positions.forEach((pos, index) => {
      if (!consolidated[pos.ticker]) {
        consolidated[pos.ticker] = { ticker: pos.ticker, totalQty: 0, totalInvested: 0, weightedDateSum: 0, transactions: [] };
      }
      const tickerData = consolidated[pos.ticker];
      const qty = pos.quantity;
      const price = pos.purchase_price;
      const dateStr = pos.purchase_date || new Date().toISOString().slice(0, 10);
      const timestamp = new Date(dateStr).getTime();
      tickerData.totalQty += qty;
      tickerData.totalInvested += (qty * price);
      tickerData.weightedDateSum += (timestamp * qty);
      tickerData.transactions.push({ ...pos, originalIndex: index, purchase_date: dateStr });
    });
    return Object.values(consolidated).map(item => {
      const avgPrice = item.totalInvested / item.totalQty;
      const avgDate = new Date(item.weightedDateSum / item.totalQty).toISOString().slice(0, 10);
      return { ...item, avgPrice: avgPrice, avgDate: avgDate };
    });
  }

  findCloseForDate(asset, targetDateStr) {
    if (!asset || !asset.history || !asset.history.dates.length) return null;
    const { dates, closes } = asset.history;
    if (targetDateStr < dates[0]) return closes[0];
    for (let i = 0; i < dates.length; i++) { if (dates[i] >= targetDateStr) return closes[i]; }
    return closes[closes.length - 1];
  }

  getDividendsSince(asset, purchaseDateStr) {
    if (!asset || !asset.dividends || !asset.dividends.dates.length) return 0;
    let sum = 0;
    const { dates, values } = asset.dividends;
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] > purchaseDateStr) {
        sum += values[i];
      }
    }
    return sum;
  }

  /* ------------------------------------------------------------------
     CRUD — Positions
  ------------------------------------------------------------------ */
  async savePosition() {
    let ticker = this.$('posTicker').value.toUpperCase();
    if (ticker && !ticker.endsWith('.SA')) {
      const found = this.assets.find(a => a.ticker === ticker + '.SA');
      if (found) ticker = ticker + '.SA';
    }
    const qty = parseInt(this.$('posQty').value, 10);
    const price = parseFloat(this.$('posPrice').value);
    const date = this.$('posDate').value;
    if (!ticker || !qty || !price) return;
    const pos = { ticker, quantity: qty, purchase_price: price, purchase_date: date || new Date().toISOString().slice(0, 10) };
    if (this.editIndex !== null) this.portfolio.positions[this.editIndex] = pos;
    else this.portfolio.positions.push(pos);
    this.closeModal();
    this.savePortfolio();
    await this.runAnalysis();
    this.renderPositions();
    this.toast('Ativo salvo com sucesso!', 'success');
  }

  async removePosition(index) {
    this.portfolio.positions.splice(index, 1);
    this.savePortfolio();
    await this.runAnalysis();
    this.renderPositions();
    this.toast('Ativo removido', 'info');
  }

  /* ------------------------------------------------------------------
     Logic
  ------------------------------------------------------------------ */
  async runAnalysis() {
    if (!this.portfolio.positions.length || !this.marketData) { this.analysis = null; this.renderDashboard(); return; }
    const consolidated = this.consolidatePortfolio();
    const positions = [];
    let totalValue = 0, totalInvestedValue = 0;
    let totalDividendsReceived = 0;

    consolidated.forEach(item => {
      const asset = this.marketData.assets[item.ticker];
      if (!asset) return;
      const currentPrice = asset.last_price;
      const value = currentPrice * item.totalQty;

      let weightedMarketRentSum = 0;
      let tickerDividends = 0;

      item.transactions.forEach(t => {
        const histPrice = this.findCloseForDate(asset, t.purchase_date);
        const lotDividends = this.getDividendsSince(asset, t.purchase_date) * t.quantity;
        tickerDividends += lotDividends;

        if (histPrice) {
          const lotRent = ((currentPrice + (lotDividends / t.quantity) - histPrice) / histPrice * 100);
          weightedMarketRentSum += (lotRent * t.quantity);
        }
      });

      const rentInvestor = ((value + tickerDividends - item.totalInvested) / item.totalInvested * 100);
      totalDividendsReceived += tickerDividends;

      positions.push({
        ticker: item.ticker, name: asset.name, sector: asset.sector || 'N/A', quantity: item.totalQty,
        avgPrice: item.avgPrice, avgDate: item.avgDate, totalInvested: item.totalInvested,
        current_price: currentPrice, position_value: value,
        total_dividends: tickerDividends,
        rentability_market: weightedMarketRentSum / item.totalQty,
        rentability_real: rentInvestor, volatility: asset.stats.volatility || 0
      });
      totalValue += value;
      totalInvestedValue += item.totalInvested;
    });
    const allocation = {}, allocationInvested = {};
    positions.forEach(p => {
      allocation[p.ticker] = (p.position_value / totalValue * 100);
      allocationInvested[p.ticker] = (p.totalInvested / totalInvestedValue * 100);
    });
    this.analysis = {
      timestamp: new Date().toISOString(), positions, allocation, allocationInvested,
      summary: {
        total_value: totalValue,
        total_invested: totalInvestedValue,
        total_dividends: totalDividendsReceived,
        num_positions: positions.length,
        avg_rentability: positions.reduce((a, b) => a + (b.rentability_market || 0), 0) / (positions.length || 1),
        portfolio_rentability_real: totalInvestedValue > 0 ? ((totalValue + totalDividendsReceived - totalInvestedValue) / totalInvestedValue * 100) : 0,
        portfolio_volatility: positions.reduce((a, b) => a + (b.volatility || 0), 0) / (positions.length || 1)
      }
    };
    this.renderDashboard();
  }

  async runBarsi() {
    if (!this.portfolio.positions.length || !this.marketData) { this.toast('Adicione ativos ao portfólio primeiro', 'error'); return; }
    const targetYield = parseFloat(this.$('barsiYield').value) || 6;
    this.$('barsiTargetDisplay').textContent = targetYield + '%';
    const analyses = [];
    const tickers = [...new Set(this.portfolio.positions.map(p => p.ticker))];
    for (const ticker of tickers) {
      const asset = this.marketData.assets[ticker];
      if (!asset) continue;
      const divs = asset.dividends?.values || [];
      if (!divs.length) {
        analyses.push({ ticker, name: asset.name, current_price: asset.last_price, price_ceiling: null, margin_of_safety: 0, recommendation: "SEM DADOS", dpa_avg: 0, current_yield: 0 });
        continue;
      }
      const annualDpa = divs.slice(-4).reduce((a, b) => a + b, 0);
      const price = asset.last_price || 0;
      const priceCeiling = annualDpa / (targetYield / 100);
      const margin = price > 0 ? ((priceCeiling - price) / price * 100) : 0;
      let rec = "VENDER";
      if (margin > 20) rec = "COMPRAR (ALTA MARGEM)"; else if (margin > 0) rec = "COMPRAR"; else if (margin > -10) rec = "MANTER";
      analyses.push({ ticker, name: asset.name, current_price: price, price_ceiling: priceCeiling, margin_of_safety: margin, recommendation: rec, dpa_avg: annualDpa / 4, current_yield: price > 0 ? (annualDpa / price * 100) : 0 });
    }
    this.barsiResults = { analyses, summary: { buy_signals: analyses.filter(a => a.recommendation.includes('COMPRAR')).length, hold_signals: analyses.filter(a => a.recommendation.includes('MANTER')).length, sell_signals: analyses.filter(a => a.recommendation.includes('VENDER')).length } };
    this.renderBarsi();
    this.toast('Análise de preço-teto concluída!', 'success');
  }

  async runRebalance() {
    if (!this.marketData) return;
    const tickers = [...new Set(this.portfolio.positions.map(p => p.ticker))];
    if (tickers.length < 2) { this.toast('Necessário pelo menos 2 ativos para otimização', 'error'); return; }
    this.showLoading('Calculando alocação via Volatilidade Inversa...');
    const validAssets = tickers.map(t => this.marketData.assets[t]).filter(a => a && (a.stats.volatility || 0) > 0);
    if (validAssets.length === 0) { this.hideLoading(); this.toast('Não há dados de volatilidade suficientes para os ativos selecionados.', 'warning'); return; }
    const sumInverseVol = validAssets.reduce((acc, a) => acc + (1 / a.stats.volatility), 0);
    const weights = {};
    validAssets.forEach(a => { weights[a.ticker] = ((1 / a.stats.volatility) / sumInverseVol) * 100; });
    const portfolioMap = {};
    this.portfolio.positions.forEach(p => { portfolioMap[p.ticker] = (portfolioMap[p.ticker] || 0) + p.quantity; });
    const totalValue = validAssets.reduce((acc, a) => acc + (portfolioMap[a.ticker] || 0) * a.last_price, 0);
    const suggestions = [];
    validAssets.forEach(a => {
      const price = a.last_price, curQty = portfolioMap[a.ticker] || 0, tgtPct = weights[a.ticker], tgtQty = Math.round(((tgtPct / 100) * totalValue) / price), diff = tgtQty - curQty;
      if (Math.abs(diff) > 0) suggestions.push({ ticker: a.ticker, name: a.name, action: diff > 0 ? 'COMPRAR' : 'VENDER', quantity: Math.abs(diff), current_allocation: (curQty * price / totalValue * 100), target_allocation: tgtPct, price: price, total_value: Math.abs(diff) * price });
    });
    this.rebalanceResults = { optimal_allocation: { weights, expected_return: this.analysis?.summary.avg_rentability || 0, volatility: this.analysis?.summary.portfolio_volatility || 0, sharpe_ratio: (this.analysis?.summary.avg_rentability / this.analysis?.summary.portfolio_volatility) || 0 }, rebalancing_suggestions: suggestions };
    setTimeout(() => { this.renderRebalance(); this.hideLoading(); this.toast('Otimização concluída!', 'success'); }, 500);
  }

  /* ------------------------------------------------------------------
     Rendering
  ------------------------------------------------------------------ */
  renderDashboard() {
    if (!this.analysis) {
      this.$('statTotalValue').textContent = 'R$ 0,00'; this.$('statTotalInvested').textContent = 'R$ 0,00';
      this.$('statRentabilityReal').textContent = '0%'; this.$('statPositions').textContent = '0'; this.$('statVolatility').textContent = '—';
      return;
    }
    const s = this.analysis.summary;
    this.$('statTotalValue').textContent = this.formatCurrency(s.total_value);
    this.$('statTotalInvested').textContent = this.formatCurrency(s.total_invested);
    this.$('statPositions').textContent = s.num_positions;
    const rentRealEl = this.$('statRentabilityReal');
    rentRealEl.textContent = (s.portfolio_rentability_real > 0 ? '+' : '') + s.portfolio_rentability_real.toFixed(2) + '%';
    rentRealEl.className = 'stat-value ' + (s.portfolio_rentability_real >= 0 ? 'positive' : 'negative');
    this.$('statVolatility').textContent = s.portfolio_volatility.toFixed(2) + '%';
    this.renderAllocationChart();
    this.renderRentabilityChart();
  }

  renderAllocationChart() {
    if (!this.analysis || !this.analysis.positions.length) return;
    const ctx = this.$('allocationChart');
    if (this.charts.allocation) this.charts.allocation.destroy();
    const labels = this.analysis.positions.map(p => p.ticker.replace('.SA', ''));
    const colors = this.palette(labels.length);
    this.charts.allocation = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          { label: 'Valor Atual', data: this.analysis.positions.map(p => p.position_value), backgroundColor: colors, borderWidth: 2, borderColor: '#0b0f19', hoverOffset: 8, weight: 2 },
          { label: 'Valor Investido', data: this.analysis.positions.map(p => p.totalInvested), backgroundColor: colors.map(c => c + '88'), borderWidth: 2, borderColor: '#0b0f19', hoverOffset: 8, weight: 1 }
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '40%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 16, font: { family: 'Inter', size: 11 } } }, tooltip: { callbacks: { label: context => `${context.label} (${context.dataset.label}): R$ ${context.raw.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` } } } }
    });
  }

  renderRentabilityChart() {
    if (!this.analysis || !this.analysis.positions.length) return;
    const ctx = this.$('rentabilityChart');
    if (this.charts.rentability) this.charts.rentability.destroy();
    const labels = this.analysis.positions.map(p => p.ticker.replace('.SA', ''));
    this.charts.rentability = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Rentab. Ativo (%)', data: this.analysis.positions.map(p => p.rentability_market), backgroundColor: '#6366f1', borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.7 },
          { label: 'Minha Rentab. (%)', data: this.analysis.positions.map(p => p.rentability_real), backgroundColor: '#22c55e', borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.7 }
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }, grid: { display: false } }, y: { ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } } }, plugins: { legend: { display: true, position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${(ctx.raw > 0 ? '+' : '') + ctx.raw.toFixed(2)}%` } } } }
    });
  }

  renderPositions() {
    const tbody = this.$('positionsBody');
    if (!this.portfolio.positions.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum ativo no portfólio. Clique em "Adicionar Ativo".</td></tr>'; return; }
    let consolidated = this.consolidatePortfolio();
    const analysisMap = {};
    if (this.analysis) this.analysis.positions.forEach(p => { analysisMap[p.ticker] = p; });
    const sortBy = this.$('sortPositions').value;
    consolidated.sort((a, b) => {
      const an = analysisMap[a.ticker] || {}, bn = analysisMap[b.ticker] || {};
      if (sortBy === 'value') return (bn.position_value || 0) - (an.position_value || 0);
      if (sortBy === 'rentability') return (bn.rentability_real || 0) - (an.rentability_real || 0);
      return a.ticker.localeCompare(b.ticker);
    });
    tbody.innerHTML = consolidated.map(item => {
      const a = analysisMap[item.ticker] || {};
      const rent = a.rentability_real;
      return `<tr>
        <td><strong>${item.ticker.replace('.SA', '')}</strong><br><small style="color:var(--text-muted)">${a.name || item.ticker}</small></td>
        <td>${item.totalQty}</td>
        <td>R$ ${item.avgPrice.toFixed(2)}</td>
        <td>${item.avgDate}</td>
        <td>${a.current_price ? 'R$ ' + a.current_price.toFixed(2) : '—'}</td>
        <td>${a.position_value ? this.formatCurrency(a.position_value) : '—'}</td>
        <td class="${rent !== undefined ? (rent >= 0 ? 'positive' : 'negative') : ''}">${rent !== undefined ? ((rent > 0 ? '+' : '') + rent.toFixed(2) + '%') : '—'}</td>
        <td><button class="btn-primary-sm" onclick="app.manageTransactions('${item.ticker}')">⚙️</button></td>
      </tr>`;
    }).join('');
  }

  renderDividends(onlyMine) {
    if (onlyMine !== undefined) this.dividendFilterOnlyMine = onlyMine;
    const isOnlyMine = this.dividendFilterOnlyMine;

    const tbody = this.$('dividendsBody');
    if (!this.dividends || this.dividends.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum provento encontrado.</td></tr>';
      return;
    }

    let data = [...this.dividends];
    if (isOnlyMine) {
      const myTickers = new Set(this.portfolio.positions.map(p => p.ticker));
      data = data.filter(d => myTickers.has(d.ticker));
      this.$('btnFilterMyDividends').classList.replace('btn-outline', 'btn-primary');
      this.$('btnFilterAllDividends').classList.replace('btn-primary', 'btn-outline');
    } else {
      this.$('btnFilterAllDividends').classList.replace('btn-outline', 'btn-primary');
      this.$('btnFilterMyDividends').classList.replace('btn-primary', 'btn-outline');
    }

    const sortBy = this.$('sortDividends').value;
    data.sort((a, b) => {
      if (sortBy === 'data_com') {
        return (b.data_com || '').localeCompare(a.data_com || '');
      }
      if (sortBy === 'data_pagamento') {
        const dA = a.data_pagamento || '9999-12-31';
        const dB = b.data_pagamento || '9999-12-31';
        return dA.localeCompare(dB);
      }
      if (sortBy === 'ticker') {
        return a.ticker.localeCompare(b.ticker);
      }
      return 0;
    });

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${isOnlyMine ? 'Nenhum provento futuro encontrado para seus ativos.' : 'Nenhum provento encontrado no mercado.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(d => `
      <tr>
        <td><strong>${d.ticker.replace('.SA', '')}</strong><br><small style="color:var(--text-muted)">${d.nome}</small></td>
        <td><span class="badge ${d.tipo === 'JCP' ? 'badge-hold' : 'badge-buy'}">${d.tipo}</span></td>
        <td>${d.data_com}</td>
        <td>${d.data_pagamento || 'A definir'}</td>
        <td>R$ ${d.valor.toFixed(4)}</td>
      </tr>
    `).join('');
  }

  manageTransactions(ticker) {
    const tickerData = this.consolidatePortfolio().find(i => i.ticker === ticker);
    if (!tickerData) return;
    this.closeTransactionModal();
    const assetDividends = this.dividends.filter(d => d.ticker === ticker);
    const rows = tickerData.transactions.map(t => `
      <tr>
        <td>${t.purchase_date}</td><td>${t.quantity}</td><td>R$ ${t.purchase_price.toFixed(2)}</td>
        <td>
          <button class="btn-outline-sm" onclick="app.closeTransactionModal(); app.openModal(${t.originalIndex})">✏️</button>
          <button class="btn-danger-sm" onclick="if(confirm('Excluir este registro?')){ app.removePosition(${t.originalIndex}); app.manageTransactions('${ticker}'); }">🗑</button>
        </td>
      </tr>
    `).join('');
    const divRows = assetDividends.length > 0 ? assetDividends.map(d => `
      <tr>
        <td><span class="badge ${d.tipo === 'JCP' ? 'badge-hold' : 'badge-buy'}">${d.tipo}</span></td>
        <td>${d.data_com}</td><td>${d.data_pagamento || '—'}</td><td>R$ ${d.valor.toFixed(4)}</td>
      </tr>
    `).join('') : '<tr><td colspan="4" class="empty-state">Sem proventos futuros anunciados.</td></tr>';
    const div = document.createElement('div');
    div.id = 'dynamicModalContainer';
    div.innerHTML = `
      <div class="modal-overlay show" id="transactionModalOverlay">
        <div class="modal glass modal-lg" style="max-height: 90vh; overflow-y: auto;">
          <div class="modal-header"><h2>Gerenciar: ${ticker}</h2><button class="modal-close" onclick="app.closeTransactionModal()">&times;</button></div>
          <h3 class="card-title" style="font-size: 0.9rem; color: var(--accent-light);">💼 Meus Registros</h3>
          <div class="table-responsive" style="margin-bottom: 2rem; background: rgba(0,0,0,0.1); border-radius: 8px;">
            <table><thead><tr><th>Data</th><th>Qtd</th><th>Preço</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table>
          </div>
          <h3 class="card-title" style="font-size: 0.9rem; color: var(--green);">📅 Próximos Dividendos (CVM)</h3>
          <div class="table-responsive" style="background: rgba(0,0,0,0.1); border-radius: 8px;">
            <table><thead><tr><th>Tipo</th><th>Data COM</th><th>Data Pagto</th><th>Valor</th></tr></thead><tbody>${divRows}</tbody></table>
          </div>
          <div class="form-actions" style="margin-top:2rem"><button class="btn btn-primary" onclick="app.closeTransactionModal()">Fechar</button></div>
        </div>
      </div>`;
    document.body.appendChild(div);
  }

  closeTransactionModal() { const el = document.getElementById('dynamicModalContainer'); if (el) el.remove(); }

  renderBarsi() {
    if (!this.barsiResults) return;
    const analyses = [...this.barsiResults.analyses];
    const sortBy = this.$('sortBarsi').value;
    analyses.sort((a, b) => {
      if (sortBy === 'margin') return b.margin_of_safety - a.margin_of_safety;
      if (sortBy === 'yield') return b.current_yield - a.current_yield;
      return a.ticker.localeCompare(b.ticker);
    });
    this.$('barsiBody').innerHTML = analyses.map(a => {
      const bc = a.recommendation.includes('COMPRAR') ? 'badge-buy' : a.recommendation.includes('MANTER') ? 'badge-hold' : a.recommendation.includes('VENDER') ? 'badge-sell' : 'badge-none';
      return `<tr>
        <td><strong>${a.ticker.replace('.SA', '')}</strong><br><small style="color:var(--text-muted)">${a.name}</small></td>
        <td>R$ ${a.current_price.toFixed(2)}</td><td>${a.price_ceiling !== null ? 'R$ ' + a.price_ceiling.toFixed(2) : '—'}</td>
        <td class="${a.margin_of_safety > 0 ? 'positive' : 'negative'}">${a.margin_of_safety > 0 ? '+' : ''}${a.margin_of_safety.toFixed(1)}%</td>
        <td>${a.current_yield.toFixed(2)}%</td><td><span class="badge ${bc}">${a.recommendation}</span></td>
      </tr>`;
    }).join('');
    this.$('barsiBuy').textContent = this.barsiResults.summary.buy_signals;
    this.$('barsiHold').textContent = this.barsiResults.summary.hold_signals;
    this.$('barsiSell').textContent = this.barsiResults.summary.sell_signals;
    this.$('barsiSummary').style.display = 'flex';
  }

  renderRebalance() {
    if (!this.rebalanceResults) return;
    this.$('rebalancePlaceholder').style.display = 'none';
    this.$('rebalanceResults').style.display = 'block';
    const opt = this.rebalanceResults.optimal_allocation;
    this.$('rebReturn').textContent = opt.expected_return.toFixed(2) + '%';
    this.$('rebVol').textContent = opt.volatility.toFixed(2) + '%';
    this.$('rebSharpe').textContent = opt.sharpe_ratio.toFixed(4);
    const ctx = this.$('optimalChart');
    if (this.charts.optimal) this.charts.optimal.destroy();
    const tickers = Object.keys(opt.weights), weights = Object.values(opt.weights);
    this.charts.optimal = new Chart(ctx, { type: 'doughnut', data: { labels: tickers.map(t => t.replace('.SA', '')), datasets: [{ data: weights, backgroundColor: this.palette(tickers.length), borderWidth: 0, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 16, font: { family: 'Inter', size: 12 } } }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw.toFixed(2)}%` } } } } });
    const suggestions = [...(this.rebalanceResults.rebalancing_suggestions || [])];
    const sortBy = this.$('sortRebalance').value;
    suggestions.sort((a, b) => { if (sortBy === 'allocation') return b.target_allocation - a.target_allocation; if (sortBy === 'value') return b.total_value - a.total_value; return a.ticker.localeCompare(b.ticker); });
    this.$('suggestionsBody').innerHTML = suggestions.length ? suggestions.map(s => `<tr><td><span class="badge ${s.action === 'COMPRAR' ? 'badge-buy' : 'badge-sell'}">${s.action}</span></td><td><strong>${s.ticker.replace('.SA', '')}</strong><br><small style="color:var(--text-muted)">${s.name}</small></td><td>${s.quantity}</td><td>R$ ${s.price.toFixed(2)}</td><td>${this.formatCurrency(s.total_value)}</td><td>${s.current_allocation.toFixed(1)}% → ${s.target_allocation.toFixed(1)}%</td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">Portfólio já está otimizado!</td></tr>';
    this.$('suggestionsCard').style.display = 'block';
  }

  renderMarketSummary(summary) {
    if (!summary || !summary.gainers || !summary.losers) return;
    this.$('summaryDateFull').textContent = `Dados atualizados em ${summary.date} (coleta ${summary.last_update.split('T')[0]})`;
    const row = (item, isGainer) => {
      const delta = (item.daily_delta !== undefined ? item.daily_delta : item.delta) * 100;
      const vol = (item.delta_volume !== undefined ? item.delta_volume : 0) * 100;
      return `<tr><td><strong>${item.ticker.replace('.SA', '')}</strong></td><td>R$${item.last_close.toFixed(2)}</td><td class="${isGainer ? 'var-up' : 'var-down'}">${delta.toFixed(2)}% ${isGainer ? '🚀' : '📉'}</td><td class="${vol > 0 ? 'var-up' : 'var-down'}">${vol.toFixed(0)}% ${vol > 100 ? '⬆️' : ''}</td></tr>`;
    };
    this.$('gainersBody').innerHTML = summary.gainers.map(i => row(i, true)).join('');
    this.$('losersBody').innerHTML = summary.losers.map(i => row(i, false)).join('');
  }

  renderMarketTreemap(allAssets) {
    const ctx = this.$('marketTreemap');
    if (!ctx) return;
    if (this.charts.treemap) this.charts.treemap.destroy();

    const validAssets = allAssets.filter(a => a.daily_delta !== undefined);
    const posPriceAssets = validAssets.filter(a => a.daily_delta > 0);
    const negPriceAssets = validAssets.filter(a => a.daily_delta < 0);

    const getQuartiles = (values) => {
      if (values.length === 0) return [0, 0, 0, 0, 0];
      const sorted = [...values].sort((a, b) => a - b);
      const q = (p) => {
        const pos = (sorted.length - 1) * p;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        return sorted[base];
      };
      return [sorted[0], q(0.25), q(0.5), q(0.75), sorted[sorted.length - 1]];
    };

    const getCategory = (val, quartiles) => {
      if (val <= quartiles[1]) return 0;
      if (val <= quartiles[2]) return 1;
      if (val <= quartiles[3]) return 2;
      return 3;
    };

    const posVolAbs = posPriceAssets.map(a => Math.abs(a.delta_volume || 0));
    const negVolAbs = negPriceAssets.map(a => Math.abs(a.delta_volume || 0));
    const posQuartiles = getQuartiles(posVolAbs);
    const negQuartiles = getQuartiles(negVolAbs);

    const cores_negativas = ["#FFE600", "#FF9800", "#FF5722", "#D50000"];
    const cores_positivas = ["#C6FF00", "#76FF03", "#00E676", "#00C853"];

    const data = validAssets.map(a => {
      const volAbs = Math.abs(a.delta_volume || 0);
      let category = 0;
      let color = "#D3D3D3";
      if (a.daily_delta > 0) {
        category = getCategory(volAbs, posQuartiles);
        color = cores_positivas[category];
      } else if (a.daily_delta < 0) {
        category = getCategory(volAbs, negQuartiles);
        color = cores_negativas[category];
      }
      return {
        ticker: a.ticker.replace('.SA', ''),
        name: a.name,
        value: Math.max(Math.abs(a.daily_delta * 100), 0.5),
        daily: (a.daily_delta * 100).toFixed(2) + '%',
        monthly: (a.monthly_delta * 100).toFixed(2) + '%',
        delta_volume: (a.delta_volume * 100).toFixed(2) + '%',
        delta: a.daily_delta,
        color: color
      };
    });

    const getTextColor = (hex) => {
      if (!hex || hex === 'transparent') return '#ffffff';
      if (hex.startsWith('#')) hex = hex.slice(1);
      if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return L > 0.6 ? "#333333" : "#FFFFFF";
    };

    this.charts.treemap = new Chart(ctx, {
      type: 'treemap',
      data: {
        datasets: [{
          label: 'Mercado B3',
          tree: data,
          key: 'value',
          spacing: 1,
          borderWidth: 0,
          borderRadius: 2,
          backgroundColor: (context) => (context?.raw?._data?.color || '#333'),
          labels: {
            display: true,
            formatter: (context) => {
              if (!context?.raw?._data) return '';
              const item = context.raw._data;
              if (context.raw.w < 40 || context.raw.h < 30) return [item.ticker];
              return [item.ticker, `D: ${item.daily}`, `M: ${item.monthly}`];
            },
            font: (context) => {
              if (!context?.raw) return { size: 10 };
              const size = Math.min(Math.max((context.raw.w || 0) / 6, 8), 12);
              return { size: size, weight: 'bold', family: 'Inter' };
            },
            color: (context) => (context?.raw?._data ? getTextColor(context.raw._data.color) : '#fff')
          }
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => (items?.[0]?.raw?._data?.ticker || ''),
              label: (item) => {
                if (!item?.raw?._data) return '';
                const d = item.raw._data;
                return [`Nome: ${d.name}`, `Variação Dia: ${d.daily}`, `Variação Mês: ${d.monthly}`, `Delta Volume: ${d.delta_volume}`];
              }
            }
          }
        }
      }
    });
  }

  /* ------------------------------------------------------------------
     Utilities
  ------------------------------------------------------------------ */
  formatCurrency(v) { return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
  palette(n) { const b = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6']; const out = []; for (let i = 0; i < n; i++) out.push(b[i % b.length]); return out; }
  showLoading(text = 'Processando...') { this.$('loadingText').textContent = text; this.$('loadingOverlay').classList.add('show'); }
  hideLoading() { this.$('loadingOverlay').classList.remove('show'); }
  toast(message, type = 'info') { const c = this.$('toastContainer'), el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = message; c.appendChild(el); setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3800); }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new B3App(); });
