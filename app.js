// B3 Rebalanceamento & IA - Aplicação Web

class B3App {
  constructor() {
    this.marketData = null;
    this.portfolioAnalysis = null;
    this.rebalancingRecommendation = null;
    this.barsiAnalysis = null;
    this.init();
  }

  async init() {
    console.log('Inicializando B3 Rebalanceamento & IA...');
    await this.loadData();
    this.setupEventListeners();
    this.renderDashboard();
  }

  async loadData() {
    try {
      // Tenta carregar dados do servidor
      const dataFiles = [
        'data/market_data.json',
        'data/portfolio_analysis.json',
        'data/rebalancing_recommendation.json',
        'data/barsi_analysis.json'
      ];

      for (const file of dataFiles) {
        try {
          const response = await fetch(file);
          if (response.ok) {
            const data = await response.json();
            this.assignData(file, data);
          }
        } catch (e) {
          console.warn(`Não foi possível carregar ${file}`);
        }
      }

      // Se não houver dados, usa exemplo
      if (!this.marketData) {
        console.log('Usando dados de exemplo...');
        this.loadExampleData();
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      this.loadExampleData();
    }
  }

  assignData(filename, data) {
    if (filename.includes('market_data')) {
      this.marketData = data;
    } else if (filename.includes('portfolio_analysis')) {
      this.portfolioAnalysis = data;
    } else if (filename.includes('rebalancing')) {
      this.rebalancingRecommendation = data;
    } else if (filename.includes('barsi')) {
      this.barsiAnalysis = data;
    }
  }

  loadExampleData() {
    // Dados de exemplo para demonstração
    this.marketData = {
      timestamp: new Date().toISOString(),
      assets: {
        'PETR4.SA': {
          ticker: 'PETR4.SA',
          name: 'Petrobras',
          sector: 'Energia',
          last_price: 28.50,
          history: {
            dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
            closes: [28.00, 28.25, 28.50],
            volumes: [1000000, 1100000, 1050000]
          },
          stats: {
            avg_price: 27.80,
            volatility: 2.5
          }
        },
        'VALE3.SA': {
          ticker: 'VALE3.SA',
          name: 'Vale',
          sector: 'Mineração',
          last_price: 65.00,
          history: {
            dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
            closes: [64.00, 64.50, 65.00],
            volumes: [900000, 950000, 1000000]
          },
          stats: {
            avg_price: 63.50,
            volatility: 1.8
          }
        },
        'ITUB4.SA': {
          ticker: 'ITUB4.SA',
          name: 'Itaú Unibanco',
          sector: 'Financeiro',
          last_price: 26.50,
          history: {
            dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
            closes: [26.00, 26.25, 26.50],
            volumes: [1200000, 1150000, 1100000]
          },
          stats: {
            avg_price: 25.80,
            volatility: 2.1
          }
        }
      }
    };

    this.portfolioAnalysis = {
      timestamp: new Date().toISOString(),
      positions: [
        {
          ticker: 'PETR4.SA',
          name: 'Petrobras',
          quantity: 100,
          current_price: 28.50,
          position_value: 2850,
          rentability_1y: 5.2,
          volatility: 2.5
        },
        {
          ticker: 'VALE3.SA',
          name: 'Vale',
          quantity: 50,
          current_price: 65.00,
          position_value: 3250,
          rentability_1y: 8.1,
          volatility: 1.8
        },
        {
          ticker: 'ITUB4.SA',
          name: 'Itaú Unibanco',
          quantity: 75,
          current_price: 26.50,
          position_value: 1987.50,
          rentability_1y: 3.5,
          volatility: 2.1
        }
      ],
      summary: {
        total_value: 8087.50,
        num_positions: 3,
        avg_rentability: 5.6,
        portfolio_volatility: 2.1
      }
    };

    this.barsiAnalysis = {
      timestamp: new Date().toISOString(),
      analyses: [
        {
          ticker: 'PETR4.SA',
          name: 'Petrobras',
          current_price: 28.50,
          price_ceiling: 35.00,
          margin_of_safety: 22.8,
          recommendation: 'COMPRAR - Preço abaixo do teto com boa margem'
        },
        {
          ticker: 'VALE3.SA',
          name: 'Vale',
          current_price: 65.00,
          price_ceiling: 72.00,
          margin_of_safety: 10.8,
          recommendation: 'COMPRAR - Preço abaixo do teto'
        },
        {
          ticker: 'ITUB4.SA',
          name: 'Itaú Unibanco',
          current_price: 26.50,
          price_ceiling: 28.00,
          margin_of_safety: 5.7,
          recommendation: 'MANTER - Preço próximo ao teto'
        }
      ]
    };
  }

  setupEventListeners() {
    // Listeners para navegação
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        this.showSection(section);
      });
    });

    // Listener para upload de portfólio
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => this.handlePortfolioUpload());
    }
  }

  showSection(section) {
    // Esconde todas as seções
    document.querySelectorAll('[data-section-content]').forEach(el => {
      el.style.display = 'none';
    });

    // Mostra a seção selecionada
    const content = document.querySelector(`[data-section-content="${section}"]`);
    if (content) {
      content.style.display = 'block';
    }

    // Atualiza nav ativa
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`).classList.add('active');
  }

  renderDashboard() {
    this.renderPortfolioSummary();
    this.renderPositions();
    this.renderBarsiAnalysis();
    this.renderAllocationChart();
  }

  renderPortfolioSummary() {
    const container = document.getElementById('portfolioSummary');
    if (!container || !this.portfolioAnalysis) return;

    const summary = this.portfolioAnalysis.summary;
    container.innerHTML = `
      <div class="stat-box">
        <div class="stat-label">Valor Total</div>
        <div class="stat-value">R$ ${summary.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Posições</div>
        <div class="stat-value">${summary.num_positions}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Rentabilidade Média</div>
        <div class="stat-value" style="color: ${summary.avg_rentability > 0 ? 'var(--success)' : 'var(--danger)'}">
          ${summary.avg_rentability > 0 ? '+' : ''}${summary.avg_rentability.toFixed(2)}%
        </div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Volatilidade</div>
        <div class="stat-value">${summary.portfolio_volatility.toFixed(2)}%</div>
      </div>
    `;
  }

  renderPositions() {
    const container = document.getElementById('positionsTable');
    if (!container || !this.portfolioAnalysis) return;

    const positions = this.portfolioAnalysis.positions;
    let html = `
      <table>
        <thead>
          <tr>
            <th>Ativo</th>
            <th>Quantidade</th>
            <th>Preço</th>
            <th>Valor</th>
            <th>Rentabilidade</th>
            <th>Volatilidade</th>
          </tr>
        </thead>
        <tbody>
    `;

    positions.forEach(pos => {
      const rentColor = pos.rentability_1y > 0 ? 'var(--success)' : 'var(--danger)';
      html += `
        <tr>
          <td><strong>${pos.ticker}</strong><br><small>${pos.name}</small></td>
          <td>${pos.quantity}</td>
          <td>R$ ${pos.current_price.toFixed(2)}</td>
          <td>R$ ${pos.position_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          <td style="color: ${rentColor}">
            ${pos.rentability_1y > 0 ? '+' : ''}${pos.rentability_1y.toFixed(2)}%
          </td>
          <td>${pos.volatility.toFixed(2)}%</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  }

  renderBarsiAnalysis() {
    const container = document.getElementById('barsiTable');
    if (!container || !this.barsiAnalysis) return;

    const analyses = this.barsiAnalysis.analyses;
    let html = `
      <table>
        <thead>
          <tr>
            <th>Ativo</th>
            <th>Preço Atual</th>
            <th>Preço-Teto</th>
            <th>Margem</th>
            <th>Recomendação</th>
          </tr>
        </thead>
        <tbody>
    `;

    analyses.forEach(analysis => {
      let badgeClass = 'badge-info';
      if (analysis.recommendation.includes('COMPRAR')) badgeClass = 'badge-success';
      else if (analysis.recommendation.includes('VENDER')) badgeClass = 'badge-danger';
      else if (analysis.recommendation.includes('MANTER')) badgeClass = 'badge-warning';

      html += `
        <tr>
          <td><strong>${analysis.ticker}</strong><br><small>${analysis.name}</small></td>
          <td>R$ ${analysis.current_price.toFixed(2)}</td>
          <td>R$ ${analysis.price_ceiling.toFixed(2)}</td>
          <td style="color: ${analysis.margin_of_safety > 0 ? 'var(--success)' : 'var(--danger)'}">
            ${analysis.margin_of_safety > 0 ? '+' : ''}${analysis.margin_of_safety.toFixed(1)}%
          </td>
          <td><span class="badge ${badgeClass}">${analysis.recommendation.split(' - ')[0]}</span></td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  }

  renderAllocationChart() {
    const container = document.getElementById('allocationChart');
    if (!container || !this.portfolioAnalysis) return;

    const positions = this.portfolioAnalysis.positions;
    const total = this.portfolioAnalysis.summary.total_value;

    let html = '<div class="grid-2">';
    positions.forEach(pos => {
      const percentage = (pos.position_value / total * 100).toFixed(1);
      html += `
        <div class="card">
          <div class="card-title">${pos.ticker}</div>
          <div class="card-subtitle">${pos.name}</div>
          <div style="margin-top: 1rem;">
            <div style="background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: var(--primary); height: 100%; width: ${percentage}%;"></div>
            </div>
            <div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-light);">
              ${percentage}% (R$ ${pos.position_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  handlePortfolioUpload() {
    alert('Funcionalidade de upload em desenvolvimento!\n\nPor enquanto, use o arquivo sample_portfolio.json como exemplo.');
  }
}

// Inicializa app quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  window.app = new B3App();
});
