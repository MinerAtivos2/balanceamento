# 📊 B3 Rebalanceamento & IA

Plataforma inteligente de análise e rebalanceamento de portfólios de investimentos na B3 (Bolsa Brasileira).
Esta versão é 100% Client-Side, permitindo a execução diretamente no navegador via **GitHub Pages**.

## 🚀 Como acessar
Acesse agora em: [https://minerativos2.github.io/balanceamento](https://minerativos2.github.io/balanceamento)

## ✨ Funcionalidades
- **Dashboard Interativo:** Visão geral da alocação e rentabilidade do seu portfólio.
- **Gestão de Posições:** Adicione ativos individualmente ou em massa (Bulk Add).
- **Método Barsi (Preço-Teto):** Calcule o preço máximo para garantir o dividend yield desejado.
- **Rebalanceamento Inteligente:** Otimização de portfólio baseada em risco (Inverse Volatility).
- **Privacidade Total:** Seus dados são salvos apenas no seu navegador (`localStorage`).
- **Dados Reais:** Integração com a API Brapi.dev para cotações e dividendos atualizados.

## 🛠️ Tecnologias
- **Frontend:** HTML5, CSS3 (Modern Glassmorphism), Vanilla JavaScript (ES6+).
- **Gráficos:** Chart.js.
- **Matemática:** Math.js.
- **Dados:** Brapi.dev API.
- **Hospedagem:** GitHub Pages.

## ⚙️ Configuração da API
Para dados em tempo real:
1. Obtenha um token gratuito em [Brapi.dev](https://brapi.dev/).
2. No site, vá em **Sobre** e insira seu token no campo de configurações.
3. Clique em **Atualizar Dados** na barra lateral.

## 📁 Estrutura do Projeto
- `/` (raiz): Código da aplicação web estática.
- `app.js`: Lógica principal (análise, Barsi, rebalanceamento).
- `assets.json`: Catálogo de ativos disponíveis para seleção.
- `market_data_fallback.json`: Dados históricos de exemplo (caso a API não seja configurada).
- `backend/`: Código legado da versão Python/Flask.

---
*Aviso Legal: Este projeto é uma ferramenta educacional. Não constitui recomendação de investimento.*
