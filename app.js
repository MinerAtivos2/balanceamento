/* ==========================================================================
   B3 Rebalanceamento & IA — Frontend Application (100% Client-Side)
   ========================================================================== */

class B3App {
  constructor() {
    this.portfolio = { name: 'Meu Portfólio', positions: [] };
    this.assets = [];
    this.marketData = null;
    this.analysis = null;
    this.charts = {};
    this.init();
  }

  /* ------------------------------------------------------------------
     Initialisation
  ------------------------------------------------------------------ */
  async init() {
    this.bindUI();
    this.setupNavigation();
    this.setupModal();

    await this.loadMarketData();
    await this.loadAssets();
    await this.loadPortfolio();
    await this.runAnalysis();

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

    // Populate ticker dropdown
    const select = this.$('posTicker');
    select.innerHTML = '<option value="">Selecione...</option>';
    this.assets.forEach(a => {
      select.innerHTML += `<option value="${a.ticker}">${a.ticker} — ${a.name}</option>`;
    });

    if (editIndex !== null && this.portfolio.positions[editIndex]) {
      const pos = this.portfolio.positions[editIndex];
      select.value = pos.ticker;
      this.$('posQty').value = pos.quantity;
      this.$('posPrice').value = pos.purchase_price;
    } else {
      this.$('posQty').value = '';
      this.$('posPrice').value = '';
    }

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

    // Ticker select options
    let options = '<option value="">Selecione...</option>';
    this.assets.forEach(a => {
      options += `<option value="${a.ticker}">${a.ticker}</option>`;
    });

    tr.innerHTML = `
      <td>
        <select class="bulk-ticker" style="width: 100%">${options}</select>
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
    const newPositions = [];
    const date = new Date().toISOString().slice(0, 10);

    for (const row of rows) {
      const ticker = row.querySelector('.bulk-ticker').value;
      const qty = parseInt(row.querySelector('.bulk-qty').value, 10);
      const price = parseFloat(row.querySelector('.bulk-price').value);

      if (ticker && !isNaN(qty) && !isNaN(price)) {
        newPositions.push({
          ticker,
          quantity: qty,
          purchase_price: price,
          purchase_date: date
        });
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
      const res = await fetch('data/market_data.json');
      this.marketData = await res.json();
    } catch (err) {
      console.error('Erro ao carregar dados de mercado:', err);
      this.toast('Erro ao carregar dados históricos', 'error');
    }
  }

  async loadAssets() {
    try {
      const res = await fetch('assets.json');
      const data = await res.json();
      this.assets = data.assets || [];
    } catch { this.assets = []; }
  }

  async loadPortfolio() {
    const saved = localStorage.getItem('b3_portfolio');
    if (saved) {
      try {
        this.portfolio = JSON.parse(saved);
      } catch {
        this.portfolio = { name: 'Meu Portfólio', positions: [] };
      }
    } else {
      // Tenta carregar sample_portfolio.json se existir (primeira vez)
      try {
        const res = await fetch('sample_portfolio.json');
        if (res.ok) this.portfolio = await res.json();
      } catch {
        this.portfolio = { name: 'Meu Portfólio', positions: [] };
      }
    }
  }

  savePortfolio() {
    localStorage.setItem('b3_portfolio', JSON.stringify(this.portfolio));
  }

  /* ------------------------------------------------------------------
     CRUD — Positions
  ------------------------------------------------------------------ */
  async savePosition() {
    const ticker = this.$('posTicker').value;
    const qty = parseInt(this.$('posQty').value, 10);
    const price = parseFloat(this.$('posPrice').value);
    if (!ticker || !qty || !price) return;

    const pos = { ticker, quantity: qty, purchase_price: price, purchase_date: new Date().toISOString().slice(0, 10) };

    if (this.editIndex !== null) {
      this.portfolio.positions[this.editIndex] = pos;
    } else {
      this.portfolio.positions.push(pos);
    }

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
     Logic — 100% Client-Side
  ------------------------------------------------------------------ */
  async runAnalysis() {
    if (!this.portfolio.positions.length || !this.marketData) {
      this.analysis = null;
      this.renderDashboard();
      return;
    }

    const portfolioMap = {};
    this.portfolio.positions.forEach(p => { portfolioMap[p.ticker] = (portfolioMap[p.ticker] || 0) + p.quantity; });

    const positions = [];
    let totalValue = 0;

    for (const [ticker, qty] of Object.entries(portfolioMap)) {
      const asset = this.marketData.assets[ticker];
      if (!asset) continue;

      const price = asset.last_price;
      const value = price * qty;
      const closes = asset.history.closes;
      const avg_1y = closes.length >= 252
        ? closes.slice(-252).reduce((a, b) => a + b, 0) / 252
        : closes.reduce((a, b) => a + b, 0) / closes.length;

      const rent = ((price - avg_1y) / avg_1y * 100);

      positions.push({
        ticker,
        name: asset.name,
        sector: asset.sector || 'N/A',
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
      allocation[p.ticker] = (p.position_value / totalValue * 100);
    });

    const avgRent = positions.reduce((a, b) => a + b.rentability_1y, 0) / positions.length;
    const avgVol = positions.reduce((a, b) => a + b.volatility, 0) / positions.length;

    this.analysis = {
      timestamp: new Date().toISOString(),
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
  }

  async runBarsi() {
    if (!this.portfolio.positions.length || !this.marketData) {
      this.toast('Adicione ativos ao portfólio primeiro', 'error');
      return;
    }

    const targetYield = parseFloat(this.$('barsiYield').value) || 6;
    this.$('barsiTargetDisplay').textContent = targetYield + '%';

    const analyses = [];
    const tickers = [...new Set(this.portfolio.positions.map(p => p.ticker))];

    for (const ticker of tickers) {
      const asset = this.marketData.assets[ticker];
      if (!asset) continue;

      const divs = asset.dividends?.values || [];
      if (!divs.length) {
        analyses.push({
          ticker, name: asset.name, current_price: asset.last_price,
          price_ceiling: null, margin_of_safety: 0, recommendation: "SEM DADOS",
          dpa_avg: 0, current_yield: 0
        });
        continue;
      }

      // Últimos 12 meses de dividendos (aproximadamente)
      const annualDpa = divs.slice(-4).reduce((a, b) => a + b, 0); // Assume-se trimestral no yfinance em muitos casos
      // Nota: o yfinance dividends varia. Para ser mais robusto, somar o último ano:
      // Mas aqui simplificamos como somar os últimos valores.

      const price = asset.last_price;
      const priceCeiling = annualDpa / (targetYield / 100);
      const margin = ((priceCeiling - price) / price * 100);
      const currentYield = (annualDpa / price * 100);

      let rec = "VENDER";
      if (margin > 20) rec = "COMPRAR (ALTA MARGEM)";
      else if (margin > 0) rec = "COMPRAR";
      else if (margin > -10) rec = "MANTER";

      analyses.push({
        ticker, name: asset.name, current_price: price,
        price_ceiling: priceCeiling, margin_of_safety: margin,
        recommendation: rec, dpa_avg: annualDpa / 4, current_yield: currentYield
      });
    }

    analyses.sort((a, b) => b.margin_of_safety - a.margin_of_safety);

    const summary = {
      buy_signals: analyses.filter(a => a.recommendation.includes('COMPRAR')).length,
      hold_signals: analyses.filter(a => a.recommendation.includes('MANTER')).length,
      sell_signals: analyses.filter(a => a.recommendation.includes('VENDER')).length
    };

    this.renderBarsi({ analyses, summary });
    this.toast('Análise de preço-teto concluída!', 'success');
  }

  async runRebalance() {
    if (!this.marketData) return;
    const tickers = [...new Set(this.portfolio.positions.map(p => p.ticker))];
    if (tickers.length < 2) {
      this.toast('Necessário pelo menos 2 ativos para otimização', 'error');
      return;
    }

    this.showLoading('Calculando alocação via Volatilidade Inversa...');

    // Estratégia: Volatilidade Inversa (Inverse Volatility Weighting)
    // Peso_i = (1 / Vol_i) / Sum(1 / Vol_j)

    const validAssets = tickers.map(t => this.marketData.assets[t]).filter(a => a && a.stats.volatility > 0);
    const sumInverseVol = validAssets.reduce((acc, a) => acc + (1 / a.stats.volatility), 0);

    const weights = {};
    validAssets.forEach(a => {
      weights[a.ticker] = ((1 / a.stats.volatility) / sumInverseVol) * 100;
    });

    const portfolioMap = {};
    this.portfolio.positions.forEach(p => { portfolioMap[p.ticker] = (portfolioMap[p.ticker] || 0) + p.quantity; });

    const totalValue = validAssets.reduce((acc, a) => acc + (portfolioMap[a.ticker] || 0) * a.last_price, 0);

    const suggestions = [];
    validAssets.forEach(a => {
      const price = a.last_price;
      const curQty = portfolioMap[a.ticker] || 0;
      const curVal = curQty * price;
      const curPct = (curVal / totalValue * 100);
      const tgtPct = weights[a.ticker];
      const tgtVal = (tgtPct / 100) * totalValue;
      const tgtQty = Math.round(tgtVal / price);
      const diff = tgtQty - curQty;

      if (Math.abs(diff) > 0) {
        suggestions.push({
          ticker: a.ticker,
          name: a.name,
          action: diff > 0 ? 'COMPRAR' : 'VENDER',
          quantity: Math.abs(diff),
          current_allocation: curPct,
          target_allocation: tgtPct,
          price: price,
          total_value: Math.abs(diff) * price
        });
      }
    });

    const optResult = {
      optimal_allocation: {
        weights,
        expected_return: this.analysis?.summary.avg_rentability || 0,
        volatility: this.analysis?.summary.portfolio_volatility || 0,
        sharpe_ratio: (this.analysis?.summary.avg_rentability / this.analysis?.summary.portfolio_volatility) || 0
      },
      rebalancing_suggestions: suggestions
    };

    setTimeout(() => {
      this.renderRebalance(optResult);
      this.hideLoading();
      this.toast('Otimização concluída!', 'success');
    }, 500);
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
          <button class="btn-danger-sm" onclick="app.removePosition(${i})">🗑</button>
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

  showLoading(text = 'Processando...') {
    this.$('loadingText').textContent = text;
    this.$('loadingOverlay').classList.add('show');
  }

  hideLoading() {
    this.$('loadingOverlay').classList.remove('show');
  }

  $(id) { return document.getElementById(id); }

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
