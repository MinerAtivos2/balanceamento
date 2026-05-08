import yfinance as yf
import g4f
import json
import os
from datetime import datetime, timedelta
import time
import requests
import feedparser
import re

# Configurações
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
ASSETS_JSON = os.path.join(os.path.dirname(__file__), '..', 'assets.json')
MARKET_SUMMARY_JSON = os.path.join(DATA_DIR, 'market_summary.json')
OUTPUT_JSON = os.path.join(DATA_DIR, 'market_news.json')
GAS_URL = os.environ.get('GAS_URL')

def load_tickers_from_sheets():
    if not GAS_URL:
        print("⚠️ GAS_URL não configurada. Buscando apenas ativos locais.")
        return []
    try:
        response = requests.post(GAS_URL, json={"action": "get_all_tickers"}, timeout=30)
        data = response.json()
        if data.get('success'):
            return data.get('tickers', [])
    except Exception as e:
        print(f"❌ Erro ao buscar tickers da Planilha: {e}")
    return []

def load_tickers():
    tickers = set()
    # 1. Ativos dos portfólios (Planilha)
    tickers.update(load_tickers_from_sheets())

    # 2. Ativos do resumo de mercado (Altas/Baixas)
    if os.path.exists(MARKET_SUMMARY_JSON):
        try:
            with open(MARKET_SUMMARY_JSON, 'r', encoding='utf-8') as f:
                summary = json.load(f)
            tickers.update([a['ticker'] for a in summary.get('gainers', [])])
            tickers.update([a['ticker'] for a in summary.get('losers', [])])
        except: pass

    # 3. Ativos do assets.json (opcional, mas garante que não esqueçamos ativos locais)
    if os.path.exists(ASSETS_JSON):
        try:
            with open(ASSETS_JSON, 'r', encoding='utf-8') as f:
                data = json.load(f)
                tickers.update([a['ticker'] for a in data.get('assets', [])])
        except: pass

    # 4. Fallback/Priority básicos
    priority = ["PETR4.SA", "VALE3.SA", "ITUB4.SA", "BBDC4.SA", "BBAS3.SA", "MGLU3.SA", "ABEV3.SA", "WEGE3.SA"]
    tickers.update(priority)

    return list(tickers)

def get_market_movers():
    """Retorna lista de tickers que estão no resumo de mercado (altas/baixas)"""
    movers = []
    if os.path.exists(MARKET_SUMMARY_JSON):
        try:
            with open(MARKET_SUMMARY_JSON, 'r', encoding='utf-8') as f:
                summary = json.load(f)
            movers.extend([a['ticker'] for a in summary.get('gainers', [])])
            movers.extend([a['ticker'] for a in summary.get('losers', [])])
        except: pass
    return movers

def fetch_rss_news(ticker):
    """Busca notícias via Google News RSS como fonte alternativa"""
    clean_ticker = ticker.replace('.SA', '')
    url = f"https://news.google.com/rss/search?q={clean_ticker}+B3+quando:7d&hl=pt-BR&gl=BR&ceid=BR:pt-150"
    try:
        feed = feedparser.parse(url)
        results = []
        for entry in feed.entries[:5]:
            results.append({
                "title": entry.title,
                "link": entry.link,
                "pubDate": entry.published,
                "source": "Google News"
            })
        return results
    except:
        return []

def get_ai_summary(ticker, news_items, is_priority=False):
    if not news_items:
        return "Sem notícias recentes de impacto encontradas nos principais canais financeiros."

    context = ". ".join([item['title'] for item in news_items])

    # Se não for prioridade, fazemos uma síntese simples (Headline Synthesis)
    if not is_priority:
        # Apenas limpa e organiza os títulos
        clean_titles = [t.strip() for t in context.split('.') if len(t.strip()) > 10]
        if clean_titles:
            return f"Destaques: {'; '.join(clean_titles[:2])}. Ativo em monitoramento setorial."
        return "Ativo com baixa frequência de notícias recentes."

    prompt = (
        f"Aja como um analista B3. Resuma em 2 frases objetivas as notícias de {ticker}. "
        f"Seja direto sobre o sentimento (positivo/negativo/neutro).\nNotícias: {context}"
    )

    for provider in [g4f.Provider.PollinationsAI, g4f.Provider.PuterJS]:
        try:
            response = g4f.ChatCompletion.create(
                model="openai" if provider == g4f.Provider.PollinationsAI else "gpt-4o-mini",
                provider=provider,
                messages=[{"role": "user", "content": prompt}],
            )
            if response and len(response) > 15:
                return response.strip()
        except:
            continue

    return f"Resumo: {context[:200]}..."

def main():
    print("🚀 Iniciando News Fetcher (Multi-Source)...")
    all_tickers = load_tickers()
    movers = get_market_movers()

    news_output = {
        "last_update": datetime.now().isoformat(),
        "market_summary": "O mercado brasileiro segue atento ao cenário fiscal e movimentações de commodities.",
        "assets": {},
        "market_movers": movers,
        "coverage_period": ""
    }

    processed_count = 0
    total = len(all_tickers)

    # Rastrear datas para o período de cobertura
    all_dates = []

    # Ordena para processar movers primeiro
    sorted_tickers = movers + [t for t in all_tickers if t not in movers]

    for ticker in sorted_tickers:
        processed_count += 1
        if processed_count % 10 == 0:
            print(f"Progresso: {processed_count}/{total}")

        if processed_count > 400: break

        try:
            # Fonte 1: Yahoo Finance
            y_news = []
            try:
                t_obj = yf.Ticker(ticker)
                for item in t_obj.news[:3]:
                    title = item.get('title') or item.get('content', {}).get('title', '')
                    link = item.get('link') or item.get('content', {}).get('clickThroughUrl', {}).get('url', '')
                    pub_time = item.get('providerPublishTime') or item.get('content', {}).get('pubDate', '')

                    if title:
                        date_str = ""
                        if pub_time:
                            try:
                                dt = datetime.fromtimestamp(pub_time) if isinstance(pub_time, int) else datetime.fromisoformat(pub_time.replace('Z',''))
                                date_str = dt.isoformat()
                                all_dates.append(dt)
                            except: pass

                        y_news.append({
                            "title": title,
                            "link": link,
                            "pubDate": date_str,
                            "source": "Yahoo Finance"
                        })
            except: pass

            # Fonte 2: Google News RSS
            rss_news = fetch_rss_news(ticker)

            # Merge e Deduplicação (pelo título simplificado)
            combined_news = []
            seen_titles = set()
            for item in (y_news + rss_news):
                # Limpa título para comparação (remove fonte no final do google news)
                clean_title = re.sub(r' - .*$', '', item['title']).strip().lower()
                if clean_title not in seen_titles:
                    combined_news.append(item)
                    seen_titles.add(clean_title)

            is_prio = ticker in movers or processed_count <= 30
            summary = get_ai_summary(ticker, combined_news, is_priority=is_prio)

            news_output["assets"][ticker] = {
                "summary": summary,
                "news_items": combined_news[:3], # Salva os links e títulos originais
                "updated_at": datetime.now().isoformat()
            }

            if is_prio: time.sleep(0.4)

        except Exception as e:
            print(f"Erro em {ticker}: {e}")

    # Período de cobertura
    if all_dates:
        start_date = min(all_dates).strftime('%d/%m/%Y')
        end_date = max(all_dates).strftime('%d/%m/%Y')
        news_output["coverage_period"] = f"{start_date} a {end_date}"

    # Insight geral
    top_summaries = {t: news_output["assets"][t]["summary"] for t in sorted_tickers[:10] if t in news_output["assets"]}
    try:
        combined = "\n".join([f"{t}: {s}" for t, s in top_summaries.items()])
        news_output["market_summary"] = g4f.ChatCompletion.create(
            model="openai",
            provider=g4f.Provider.PollinationsAI,
            messages=[{"role": "user", "content": f"Resuma o clima do mercado B3 ({news_output['coverage_period']}) em 3 frases:\n{combined}"}],
        )
    except: pass

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(news_output, f, indent=2, ensure_ascii=False)

    print(f"✅ Finalizado! {len(news_output['assets'])} ativos com insights.")

if __name__ == "__main__":
    main()
