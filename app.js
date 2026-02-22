/* ==========================================================================
   B3 Rebalanceamento & IA — Frontend Application
   ========================================================================== */

// SUPABASE CONFIGURATION - Substitua com suas credenciais do projeto Supabase
const SUPABASE_URL = 'SUA_URL_DO_SUPABASE';
const SUPABASE_KEY = 'SUA_ANON_KEY_DO_SUPABASE';

class B3App {
  constructor() {
    this.supabase = null;
    this.user = null; // { id, username }
    this.portfolio = { name: 'Meu Portfólio', positions: [] };
    this.assets = [];
    this.marketData = null;
    this.analysis = null;
    this.charts = {};
    this.brapiToken = '';

    this.initSupabase();
    this.init();
  }

  initSupabase() {
    if (SUPABASE_URL.startsWith('http')) {
      this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
      console.warn('Supabase não configurado. Use LocalStorage para testes.');
    }
  }

  /* ------------------------------------------------------------------
     Initialisation
  ------------------------------------------------------------------ */
  async init() {
    this.bindUI();
    this.setupNavigation();
    this.setupModal();

    await this.loadAssets();

    // Check for logged user
    const savedUser = localStorage.getItem('b3_user');
    if (savedUser) {
      this.user = JSON.parse(savedUser);
      this.showLogin(false);
      await this.loadAppData();
    } else {
      this.showLogin(true);
    }
  }

  async loadAppData() {
    this.showLoading('Carregando dados...');
    await this.fetchGlobalSettings();
    await this.loadPortfolio();
    await this.runAnalysis();
    this.renderPositions();
    this.updateUIForUser();
    this.hideLoading();
  }

  async fetchGlobalSettings() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('settings')
        .select('value')
        .eq('key', 'brapi_token')
        .single();

      if (data) {
        this.brapiToken = data.value;
      }
    } catch (err) {
      console.warn('Erro ao buscar configurações globais:', err);
    }
  }

  bindUI() {
    // Login
    this.$('loginForm').addEventListener('submit', e => {
      e.preventDefault();
      this.handleLogin();
    });

    // Buttons
    this.$('btnAddPosition').addEventListener('click', () => this.openModal());
    this.$('btnAnalyze').addEventListener('click', () => this.runAnalysis());
    this.$('btnRunBarsi').addEventListener('click', () => this.runBarsi());
    this.$('btnRunRebalance').addEventListener('click', () => this.runRebalance());
    this.$('btnFetchData').addEventListener('click', () => this.fetchMarketData());
    this.$('btnAddBulk').addEventListener('click', () => this.openBulkModal());
    this.$('btnSaveToken').addEventListener('click', () => this.saveToken());

    // Mobile
    this.$('hamburger').addEventListener('click', () => this.toggleSidebar());
    this.$('overlay').addEventListener('click', () => this.toggleSidebar(false));
  }

  $(id) { return document.getElementById(id); }

  async saveToken() {
    const token = this.$('brapiTokenInput').value.trim();
    if (!token) return;

    this.showLoading('Salvando token...');
    try {
        if (this.supabase) {
            const { error } = await this.supabase
                .from('settings')
                .upsert([{ key: 'brapi_token', value: token }]);

            if (error) throw error;
        }
        this.brapiToken = token;
        localStorage.setItem('brapi_token', token);
        this.toast('Token global atualizado com sucesso!', 'success');
    } catch (err) {
        console.error(err);
        this.toast('Erro ao salvar token no banco de dados.', 'error');
    } finally {
        this.hideLoading();
    }
  }

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
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.querySelector(`[data-page="${name}"]`);
    if (page) page.classList.add('active');

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
    this.editIndex = editIndex;
    this.$('modalTitle').textContent = editIndex !== null ? 'Editar Ativo' : 'Adicionar Ativo';

    // Populate ticker datalist
    const list = this.$('tickerList');
    list.innerHTML = '';
    this.assets.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.ticker.replace('.SA', '');
      opt.textContent = a.name;
      list.appendChild(opt);
    });

    const tickerInput = this.$('posTicker');
    const warning = this.$('tickerWarning');

    tickerInput.oninput = () => {
        const val = tickerInput.value.trim().toUpperCase();
        const isB3 = this.assets.some(a => a.ticker.replace('.SA', '') === val);
        warning.style.display = (val && !isB3) ? 'block' : 'none';
    };

    if (editIndex !== null && this.portfolio.positions[editIndex]) {
      const pos = this.portfolio.positions[editIndex];
      tickerInput.value = pos.ticker.replace('.SA', '');
      this.$('posQty').value = pos.quantity;
      this.$('posPrice').value = pos.purchase_price;
    } else {
      tickerInput.value = '';
      this.$('posQty').value = '';
      this.$('posPrice').value = '';
    }

    warning.style.display = 'none';
    this.$('modalOverlay').classList.add('show');
  }

  closeModal() {
    this.$('modalOverlay').classList.remove('show');
    this.editIndex = null;
  }

  openBulkModal() {
    const tbody = this.$('bulkTableBody');
    tbody.innerHTML = '';
    this.addBulkRow(); // Add one initial row
    this.$('bulkModalOverlay').classList.add('show');
  }

  closeBulkModal() {
    this.$('bulkModalOverlay').classList.remove('show');
  }

  addBulkRow() {
    const tbody = this.$('bulkTableBody');
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>
        <input type="text" class="bulk-ticker" placeholder="Ex: PETR4" list="tickerList" style="width: 100%; text-transform: uppercase;">
      </td>
      <td>
        <input type="number" class="bulk-qty" min="1" placeholder="Qtd" style="width: 100%">
      </td>
      <td>
        <input type="number" class="bulk-price" min="0" step="0.01" placeholder="Preço" style="width: 100%">
      </td>
      <td>
        <button class="btn-danger-sm" onclick="this.closest('tr').remove()">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  async saveBulkPositions() {
    const rows = document.querySelectorAll('#bulkTableBody tr');
    const toProcess = [];
    const date = new Date().toISOString().slice(0, 10);

    for (const row of rows) {
      let ticker = row.querySelector('.bulk-ticker').value.trim().toUpperCase();
      const qty = parseInt(row.querySelector('.bulk-qty').value, 10);
      const price = parseFloat(row.querySelector('.bulk-price').value);

      if (ticker && !isNaN(qty) && !isNaN(price)) {
        // Normalize
        const isB3 = this.assets.some(a => a.ticker.replace('.SA', '') === ticker);
        if (isB3 && !ticker.endsWith('.SA')) ticker += '.SA';

        toProcess.push({ ticker, quantity: qty, purchase_price: price, purchase_date: date, user_id: this.user.id });
      }
    }

    if (toProcess.length === 0) {
      this.toast('Nenhum dado válido para salvar', 'error');
      return;
    }

    this.showLoading('Salvando ativos...');

    try {
        // We iterate and use the same aggregation logic as savePosition
        // For simplicity in a bulk scenario, we can merge them locally first then upsert
        for (const pos of toProcess) {
            const existingIndex = this.portfolio.positions.findIndex(p => p.ticker === pos.ticker);
            if (existingIndex !== -1) {
                const existing = this.portfolio.positions[existingIndex];
                const newTotalQty = existing.quantity + pos.quantity;
                const newAvgPrice = ((existing.quantity * existing.purchase_price) + (pos.quantity * pos.purchase_price)) / newTotalQty;

                existing.quantity = newTotalQty;
                existing.purchase_price = newAvgPrice;
            } else {
                this.portfolio.positions.push(pos);
            }
        }

        if (this.supabase) {
            // Upsert all positions for this user
            const { error } = await this.supabase
                .from('positions')
                .upsert(this.portfolio.positions);

            if (error) throw error;
            // Reload to get IDs
            await this.loadPortfolio();
        } else {
            await this.savePortfolio();
        }

        this.closeBulkModal();
        await this.runAnalysis();
        this.renderPositions();
        this.toast(`${toProcess.length} lançamentos processados!`, 'success');
    } catch (err) {
        console.error(err);
        this.toast('Erro ao salvar lote de ativos.', 'error');
    } finally {
        this.hideLoading();
    }
  }

  /* ------------------------------------------------------------------
     Data loading
  ------------------------------------------------------------------ */
  async loadAssets() {
    try {
      const res = await fetch('assets.json');
      const data = await res.json();
      this.assets = data.assets || [];
    } catch { this.assets = []; }
  }

  async loadPortfolio() {
    if (!this.user) return;

    try {
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from('positions')
          .select('*')
          .eq('user_id', this.user.id);

        if (error) throw error;
        this.portfolio.positions = data || [];
      } else {
        const saved = localStorage.getItem(`b3_portfolio_${this.user.username}`);
        this.portfolio.positions = saved ? JSON.parse(saved) : [];
      }
    } catch (err) {
      console.error('Erro ao carregar portfólio:', err);
      this.portfolio.positions = [];
    }
  }

  async savePortfolio() {
    // Note: In Supabase mode, we usually upsert individual positions.
    // This function can remain as a fallback or for local storage.
    if (!this.supabase && this.user) {
      localStorage.setItem(`b3_portfolio_${this.user.username}`, JSON.stringify(this.portfolio.positions));
    }
  }

  /* ------------------------------------------------------------------
     CRUD — Positions
  ------------------------------------------------------------------ */
  async savePosition() {
    let ticker = this.$('posTicker').value.trim().toUpperCase();
    const qty = parseInt(this.$('posQty').value, 10);
    const price = parseFloat(this.$('posPrice').value);
    if (!ticker || isNaN(qty) || isNaN(price)) return;

    // Normalize B3 tickers
    const isB3Known = this.assets.some(a => a.ticker.replace('.SA', '') === ticker);
    if (isB3Known && !ticker.endsWith('.SA')) {
      ticker += '.SA';
    }

    this.showLoading('Salvando...');

    try {
      let finalPos = {
        ticker,
        quantity: qty,
        purchase_price: price,
        purchase_date: new Date().toISOString().slice(0, 10),
        user_id: this.user.id
      };

      // Requirement 4: Aggregate if same ticker exists (and NOT editing a specific row)
      const existingIndex = this.portfolio.positions.findIndex((p, i) => p.ticker === ticker && i !== this.editIndex);

      if (existingIndex !== -1 && this.editIndex === null) {
        const existing = this.portfolio.positions[existingIndex];
        const newTotalQty = existing.quantity + qty;
        const newAvgPrice = ((existing.quantity * existing.purchase_price) + (qty * price)) / newTotalQty;

        finalPos.quantity = newTotalQty;
        finalPos.purchase_price = newAvgPrice;
        finalPos.id = existing.id; // Keep the same ID for Supabase upsert
      } else if (this.editIndex !== null) {
        // We are editing a specific row
        finalPos.id = this.portfolio.positions[this.editIndex].id;
      }

      if (this.supabase) {
        const { data, error } = await this.supabase
          .from('positions')
          .upsert([finalPos])
          .select()
          .single();

        if (error) throw error;

        if (this.editIndex !== null) {
            this.portfolio.positions[this.editIndex] = data;
        } else if (existingIndex !== -1) {
            this.portfolio.positions[existingIndex] = data;
        } else {
            this.portfolio.positions.push(data);
        }
      } else {
        // Local fallback
        if (this.editIndex !== null) {
          this.portfolio.positions[this.editIndex] = finalPos;
        } else if (existingIndex !== -1) {
          this.portfolio.positions[existingIndex] = finalPos;
        } else {
          this.portfolio.positions.push(finalPos);
        }
        await this.savePortfolio();
      }

      this.closeModal();
      await this.runAnalysis();
      this.renderPositions();
      this.toast('Ativo salvo com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      this.toast('Erro ao salvar posição.', 'error');
    } finally {
      this.hideLoading();
    }
  }

  async removePosition(index) {
    const pos = this.portfolio.positions[index];
    if (!pos) return;

    if (!confirm(`Deseja remover ${pos.ticker}?`)) return;

    this.showLoading('Removendo...');
    try {
      if (this.supabase && pos.id) {
        const { error } = await this.supabase
          .from('positions')
          .delete()
          .eq('id', pos.id);

        if (error) throw error;
      }

      this.portfolio.positions.splice(index, 1);
      if (!this.supabase) await this.savePortfolio();

      await this.runAnalysis();
      this.renderPositions();
      this.toast('Ativo removido', 'info');
    } catch (err) {
      console.error(err);
      this.toast('Erro ao remover ativo.', 'error');
    } finally {
      this.hideLoading();
    }
  }

  /* ------------------------------------------------------------------
     API — Analysis
  ------------------------------------------------------------------ */
  async runAnalysis() {
    if (!this.portfolio.positions.length) {
      this.analysis = null;
      this.renderDashboard();
      this.renderPositions();
      return;
    }

    if (!this.marketData) {
      await this.loadMarketData();
    }

    const m = this.marketData;
    const positions = [];
    let totalValue = 0;

    const portfolioMap = {};
    this.portfolio.positions.forEach(p => {
        portfolioMap[p.ticker] = (portfolioMap[p.ticker] || 0) + p.quantity;
    });

    for (const [ticker, qty] of Object.entries(portfolioMap)) {
      if (!m.assets[ticker]) continue;
      const asset = m.assets[ticker];
      const price = asset.last_price;
      const value = price * qty;

      const closes = asset.history.closes;
      // Calculate 1y rentability (approx 12 points if monthly)
      const last = closes[closes.length - 1];
      const first = closes.length >= 12 ? closes[closes.length - 12] : closes[0];
      const rent = ((last - first) / first) * 100;

      positions.push({
        ticker,
        name: asset.name,
        quantity: qty,
        current_price: price,
        position_value: value,
        rentability_1y: rent,
        volatility: asset.stats.volatility
      });
      totalValue += value;
    }

    const allocation = {};
    positions.forEach(p => {
      allocation[p.ticker] = (p.position_value / totalValue) * 100;
    });

    const avgRent = positions.length ? (positions.reduce((a, b) => a + b.rentability_1y, 0) / positions.length) : 0;
    const avgVol = positions.length ? (positions.reduce((a, b) => a + b.volatility, 0) / positions.length) : 0;

    this.analysis = {
      positions,
      allocation,
      summary: {
        total_value: totalValue,
        num_positions: positions.length,
        avg_rentability: avgRent,
        portfolio_volatility: avgVol
      }
    };

    this.renderDashboard();
    this.renderPositions();
  }

  async loadMarketData() {
    try {
      const res = await fetch('market_data_fallback.json');
      this.marketData = await res.json();
    } catch {
      this.marketData = { assets: {} };
    }
  }

  async runBarsi() {
    if (!this.marketData) await this.loadMarketData();
    const m = this.marketData;
    const tickers = [...new Set(this.portfolio.positions.map(p => p.ticker))];
    if (!tickers.length) {
      this.toast('Adicione ativos ao portfólio primeiro', 'error');
      return;
    }

    const targetYield = parseFloat(this.$('barsiYield').value) || 6;
    this.$('barsiTargetDisplay').textContent = targetYield + '%';

    const analyses = [];
    for (const ticker of tickers) {
      const asset = m.assets[ticker];
      if (!asset || !asset.dividends || !asset.dividends.values.length) continue;

      const divValues = asset.dividends.values;
      // Annualized DPA (last 4 if quarterly, or sum of last 12 months)
      // For fallback data, let's just sum all available if less than a year
      const annualDpa = divValues.slice(-4).reduce((a, b) => a + b, 0);

      const price = asset.last_price;
      const priceCeiling = annualDpa / (targetYield / 100);
      const margin = ((priceCeiling - price) / price) * 100;
      const currentYield = (annualDpa / price) * 100;

      let rec = 'MANTER';
      if (margin > 20) rec = 'COMPRAR (Forte)';
      else if (margin > 0) rec = 'COMPRAR';
      else if (margin < -10) rec = 'VENDER';

      analyses.push({
        ticker,
        name: asset.name,
        current_price: price,
        price_ceiling: priceCeiling,
        margin_of_safety: margin,
        current_yield: currentYield,
        recommendation: rec
      });
    }

    analyses.sort((a, b) => b.margin_of_safety - a.margin_of_safety);

    this.renderBarsi({
      analyses,
      summary: {
        buy_signals: analyses.filter(a => a.recommendation.includes('COMPRAR')).length,
        hold_signals: analyses.filter(a => a.recommendation === 'MANTER').length,
        sell_signals: analyses.filter(a => a.recommendation === 'VENDER').length
      }
    });
    this.toast('Análise concluída!', 'success');
  }

  async runRebalance() {
    if (!this.marketData) await this.loadMarketData();
    const m = this.marketData;
    const tickers = [...new Set(this.portfolio.positions.map(p => p.ticker))].filter(t => m.assets[t]);

    if (tickers.length < 2) {
      this.toast('Necessário pelo menos 2 ativos com dados históricos', 'error');
      return;
    }

    this.showLoading('Otimizando portfólio (Markowitz)...');

    // Simulate Markowitz or use mathjs for a simplified version
    // For now, let's use a simple Equal Weight or Risk Parity if mathjs is ready
    // Actually, I'll implement a simple Monte Carlo or Gradient Descent if possible
    // But for a quick "workable" version, let's do an "Equal Volatility" weighting

    const vols = tickers.map(t => m.assets[t].stats.volatility);
    const invVols = vols.map(v => 1 / (v || 1));
    const sumInvVols = invVols.reduce((a, b) => a + b, 0);
    const weights = invVols.map(v => (v / sumInvVols));

    const optimalWeights = {};
    tickers.forEach((t, i) => {
      optimalWeights[t] = weights[i] * 100;
    });

    // Calculate expected return and risk
    const returns = tickers.map(t => {
        const c = m.assets[t].history.closes;
        return (c[c.length-1] - c[0]) / c[0]; // Simple total return
    });
    const expectedReturn = weights.reduce((a, b, i) => a + b * returns[i], 0) * 100;
    const portfolioVol = weights.reduce((a, b, i) => a + b * vols[i], 0); // Approximation

    const portfolioMap = {};
    this.portfolio.positions.forEach(p => { portfolioMap[p.ticker] = (portfolioMap[p.ticker] || 0) + p.quantity; });
    const totalValue = tickers.reduce((a, t) => a + (portfolioMap[t] || 0) * m.assets[t].last_price, 0);

    const suggestions = [];
    tickers.forEach(t => {
        const price = m.assets[t].last_price;
        const curQty = portfolioMap[t] || 0;
        const targetPct = optimalWeights[t];
        const targetValue = (targetPct / 100) * totalValue;
        const targetQty = Math.round(targetValue / price);
        const diff = targetQty - curQty;

        if (diff !== 0) {
            suggestions.push({
                action: diff > 0 ? 'COMPRAR' : 'VENDER',
                ticker: t,
                name: m.assets[t].name,
                quantity: Math.abs(diff),
                price: price,
                total_value: Math.abs(diff) * price,
                current_allocation: (curQty * price / totalValue) * 100,
                target_allocation: targetPct
            });
        }
    });

    this.renderRebalance({
        optimal_allocation: {
            weights: optimalWeights,
            expected_return: expectedReturn,
            volatility: portfolioVol,
            sharpe_ratio: (expectedReturn - 10) / portfolioVol // Assuming 10% risk free
        },
        rebalancing_suggestions: suggestions
    });

    this.hideLoading();
    this.toast('Otimização concluída!', 'success');
  }

  async fetchMarketData() {
    const tickers = [...new Set(this.portfolio.positions.map(p => p.ticker))];
    if (!tickers.length) {
      this.toast('Adicione ativos ao seu portfólio primeiro.', 'error');
      return;
    }

    if (!this.brapiToken) {
      this.toast('Token da Brapi não configurado. Vá em "Sobre" para configurar.', 'error');
      this.showPage('about');
      return;
    }

    this.showLoading('Buscando dados atualizados via Brapi API...');

    try {
      const token = this.brapiToken;
      const symbols = tickers.map(t => t.replace('.SA', '')).join(',');
      const url = `https://brapi.dev/api/quote/${symbols}?token=${token}&range=1y&interval=1mo`;

      const res = await fetch(url);

      if (res.status === 401 || res.status === 403) {
        throw new Error('Token da Brapi inválido ou expirado.');
      }

      const data = await res.json();

      if (data.error || !data.results) {
        throw new Error(data.message || 'Erro na API da Brapi');
      }

      const newAssets = {};
      data.results.forEach(r => {
        const t = r.symbol + '.SA';
        newAssets[t] = {
          ticker: t,
          name: r.longName || r.symbol,
          last_price: r.regularMarketPrice,
          history: {
            closes: r.historicalDataPrice.map(h => h.close),
            dates: r.historicalDataPrice.map(h => new Date(h.date * 1000).toISOString().split('T')[0])
          },
          dividends: {
            values: r.dividendsData ? r.dividendsData.cashDividends.map(d => d.assetAmount) : [],
            dates: r.dividendsData ? r.dividendsData.cashDividends.map(d => d.paymentDate) : []
          },
          stats: {
            volatility: 2.0 // Simple placeholder if not calc
          }
        };
      });

      this.marketData = { assets: { ...this.marketData?.assets, ...newAssets } };
      this.toast('Dados atualizados com sucesso!', 'success');
      await this.runAnalysis();
    } catch (err) {
      console.error(err);
      this.toast(err.message || 'Erro ao buscar dados. Verifique sua conexão.', 'error');
    } finally {
      this.hideLoading();
    }
  }

  /* ------------------------------------------------------------------
     Rendering — Dashboard
  ------------------------------------------------------------------ */
  renderDashboard() {
    if (!this.analysis) {
      this.$('statTotalValue').textContent = 'R$ 0,00';
      this.$('statPositions').textContent = '0';
      this.$('statRentability').textContent = '—';
      this.$('statVolatility').textContent = '—';
      return;
    }

    const s = this.analysis.summary;
    this.$('statTotalValue').textContent = this.formatCurrency(s.total_value);
    this.$('statPositions').textContent = s.num_positions;

    const rentEl = this.$('statRentability');
    rentEl.textContent = (s.avg_rentability > 0 ? '+' : '') + s.avg_rentability.toFixed(2) + '%';
    rentEl.className = 'stat-value ' + (s.avg_rentability >= 0 ? 'positive' : 'negative');

    this.$('statVolatility').textContent = s.portfolio_volatility.toFixed(2) + '%';

    this.renderAllocationChart();
    this.renderRentabilityChart();
  }

  renderAllocationChart() {
    if (!this.analysis || !this.analysis.positions.length) return;
    const ctx = this.$('allocationChart');
    if (this.charts.allocation) this.charts.allocation.destroy();

    const labels = this.analysis.positions.map(p => p.ticker.replace('.SA', ''));
    const values = this.analysis.positions.map(p => p.position_value);
    const colors = this.palette(labels.length);

    this.charts.allocation = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 16, font: { family: 'Inter', size: 12 } } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.label}: R$ ${ctx.raw.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            },
          },
        },
      },
    });
  }

  renderRentabilityChart() {
    if (!this.analysis || !this.analysis.positions.length) return;
    const ctx = this.$('rentabilityChart');
    if (this.charts.rentability) this.charts.rentability.destroy();

    const labels = this.analysis.positions.map(p => p.ticker.replace('.SA', ''));
    const values = this.analysis.positions.map(p => p.rentability_1y);
    const colors = values.map(v => v >= 0 ? '#22c55e' : '#ef4444');

    this.charts.rentability = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Rentab. 1a (%)', data: values, backgroundColor: colors, borderRadius: 6, barPercentage: 0.6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94a3b8', font: { family: 'Inter' } }, grid: { display: false } },
          y: { ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(2) + '%' } },
        },
      },
    });
  }

  /* ------------------------------------------------------------------
     Rendering — Positions table
  ------------------------------------------------------------------ */
  renderPositions() {
    const tbody = this.$('positionsBody');
    if (!this.portfolio.positions.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum ativo no portfólio. Clique em "Adicionar Ativo".</td></tr>';
      return;
    }

    const analysisMap = {};
    if (this.analysis) {
      this.analysis.positions.forEach(p => { analysisMap[p.ticker] = p; });
    }

    let html = '';
    this.portfolio.positions.forEach((pos, i) => {
      const a = analysisMap[pos.ticker] || {};
      const rent = a.rentability_1y;
      const rentClass = rent !== undefined ? (rent >= 0 ? 'positive' : 'negative') : '';
      const rentText = rent !== undefined ? ((rent > 0 ? '+' : '') + rent.toFixed(2) + '%') : '—';

      html += `<tr>
        <td><strong>${pos.ticker.replace('.SA', '')}</strong><br><small style="color:var(--text-muted)">${a.name || pos.ticker}</small></td>
        <td>${pos.quantity}</td>
        <td>${a.current_price ? 'R$ ' + a.current_price.toFixed(2) : '—'}</td>
        <td>${a.position_value ? this.formatCurrency(a.position_value) : '—'}</td>
        <td class="${rentClass}">${rentText}</td>
        <td>${a.volatility !== undefined ? a.volatility.toFixed(2) + '%' : '—'}</td>
        <td>
          <div style="display:flex; gap:0.4rem;">
            <button class="btn-secondary" style="padding:0.35rem 0.6rem; font-size:0.75rem;" onclick="app.openModal(${i})">✏️</button>
            <button class="btn-danger-sm" onclick="app.removePosition(${i})">🗑</button>
          </div>
        </td>
      </tr>`;
    });
    tbody.innerHTML = html;
  }

  /* ------------------------------------------------------------------
     Rendering — Barsi
  ------------------------------------------------------------------ */
  renderBarsi(data) {
    const tbody = this.$('barsiBody');
    if (!data.analyses || !data.analyses.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum resultado</td></tr>';
      return;
    }

    let html = '';
    data.analyses.forEach(a => {
      let badgeClass = 'badge-none', badgeText = 'N/A';
      if (a.recommendation.includes('COMPRAR')) { badgeClass = 'badge-buy'; badgeText = 'COMPRAR'; }
      else if (a.recommendation.includes('MANTER')) { badgeClass = 'badge-hold'; badgeText = 'MANTER'; }
      else if (a.recommendation.includes('VENDER')) { badgeClass = 'badge-sell'; badgeText = 'VENDER'; }
      else if (a.recommendation.includes('SEM DADOS')) { badgeText = 'SEM DADOS'; }

      const marginClass = a.margin_of_safety > 0 ? 'positive' : 'negative';

      html += `<tr>
        <td><strong>${a.ticker.replace('.SA', '')}</strong><br><small style="color:var(--text-muted)">${a.name}</small></td>
        <td>R$ ${a.current_price.toFixed(2)}</td>
        <td>${a.price_ceiling !== null ? 'R$ ' + a.price_ceiling.toFixed(2) : '—'}</td>
        <td class="${marginClass}">${a.margin_of_safety > 0 ? '+' : ''}${a.margin_of_safety.toFixed(1)}%</td>
        <td>${a.current_yield.toFixed(2)}%</td>
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
      </tr>`;
    });
    tbody.innerHTML = html;

    // Summary
    const sum = data.summary || {};
    this.$('barsiBuy').textContent = sum.buy_signals || 0;
    this.$('barsiHold').textContent = sum.hold_signals || 0;
    this.$('barsiSell').textContent = sum.sell_signals || 0;
    this.$('barsiSummary').style.display = 'flex';
  }

  /* ------------------------------------------------------------------
     Rendering — Rebalance
  ------------------------------------------------------------------ */
  renderRebalance(data) {
    this.$('rebalancePlaceholder').style.display = 'none';
    this.$('rebalanceResults').style.display = 'block';

    const opt = data.optimal_allocation;
    this.$('rebReturn').textContent = opt.expected_return.toFixed(2) + '%';
    this.$('rebVol').textContent = opt.volatility.toFixed(2) + '%';
    this.$('rebSharpe').textContent = opt.sharpe_ratio.toFixed(4);

    // Optimal allocation chart
    const ctx = this.$('optimalChart');
    if (this.charts.optimal) this.charts.optimal.destroy();

    const tickers = Object.keys(opt.weights);
    const weights = Object.values(opt.weights);
    const labels = tickers.map(t => t.replace('.SA', ''));
    const colors = this.palette(labels.length);

    this.charts.optimal = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: weights, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 16, font: { family: 'Inter', size: 12 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw.toFixed(2)}%` } },
        },
      },
    });

    // Suggestions table
    const suggestions = data.rebalancing_suggestions || [];
    const tbody = this.$('suggestionsBody');
    if (!suggestions.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Portfólio já está otimizado!</td></tr>';
      this.$('suggestionsCard').style.display = 'block';
      return;
    }

    let html = '';
    suggestions.forEach(s => {
      const actionClass = s.action === 'COMPRAR' ? 'badge-buy' : 'badge-sell';
      html += `<tr>
        <td><span class="badge ${actionClass}">${s.action}</span></td>
        <td><strong>${s.ticker.replace('.SA', '')}</strong><br><small style="color:var(--text-muted)">${s.name}</small></td>
        <td>${s.quantity}</td>
        <td>R$ ${s.price.toFixed(2)}</td>
        <td>${this.formatCurrency(s.total_value)}</td>
        <td>${s.current_allocation.toFixed(1)}% → ${s.target_allocation.toFixed(1)}%</td>
      </tr>`;
    });
    tbody.innerHTML = html;
    this.$('suggestionsCard').style.display = 'block';
  }

  /* ------------------------------------------------------------------
     Utilities
  ------------------------------------------------------------------ */
  formatCurrency(v) {
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  palette(n) {
    const base = [
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
      '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
      '#a855f7', '#d946ef',
    ];
    const out = [];
    for (let i = 0; i < n; i++) out.push(base[i % base.length]);
    return out;
  }

  showLogin(show = true) {
    const overlay = this.$('loginOverlay');
    if (show) overlay.classList.add('show');
    else overlay.classList.remove('show');
  }

  async handleLogin() {
    const username = this.$('loginUsername').value.trim().toLowerCase();
    if (!username) return;

    this.showLoading('Autenticando...');

    try {
      let user = null;

      if (this.supabase) {
        // Find or create user in Supabase
        const { data, error } = await this.supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
          user = data;
        } else {
          const { data: newUser, error: createError } = await this.supabase
            .from('users')
            .insert([{ username }])
            .select()
            .single();

          if (createError) throw createError;
          user = newUser;
        }
      } else {
        // Fallback for no supabase
        user = { id: 'local-user', username };
      }

      this.user = user;
      localStorage.setItem('b3_user', JSON.stringify(user));

      this.showLogin(false);
      await this.loadAppData();
      this.toast(`Bem-vindo, ${username}!`, 'success');
    } catch (err) {
      console.error(err);
      this.toast('Erro ao fazer login. Verifique sua conexão.', 'error');
    } finally {
      this.hideLoading();
    }
  }

  updateUIForUser() {
    // Could add username to sidebar or header
    console.log('User updated:', this.user.username);
  }

  showLoading(text = 'Processando...') {
    this.$('loadingText').textContent = text;
    this.$('loadingOverlay').classList.add('show');
  }

  hideLoading() {
    this.$('loadingOverlay').classList.remove('show');
  }

  toast(message, type = 'info') {
    const container = this.$('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3800);
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  window.app = new B3App();
});
