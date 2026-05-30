import yfinance as yf
import g4f
import json
import os
from datetime import datetime, timedelta
import time
import requests
import feedparser
import urllib.parse
from newspaper import Article

# Configurações
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
GAS_URL = "https://script.google.com/macros/s/AKfycbyH2wrJBEMXBZHyTIIkeaRoI5vIYUgjX60rXqlAh6lZKEYWkZEEI9TxhbKu_pf4cD-C/exec" # os.environ.get('GAS_URL')

def load_tickers_from_monitoramento():
    if not GAS_URL:
        print("⚠️ GAS_URL não configurada.")
        return []
    try:
        response = requests.post(GAS_URL, json={"action": "get_deepnews_tickers"}, timeout=30)
        data = response.json()
        if data.get('success'):
            return data.get('tickers', [])
    except Exception as e:
        print(f"❌ Erro ao buscar tickers da aba Monitoramento: {e}")
    return []

def update_monitoramento(results):
    if not GAS_URL:
        print("⚠️ GAS_URL não configurada.")
        return
    try:
        response = requests.post(GAS_URL, json={
            "action": "update_deepnews_results",
            "results": results
        }, timeout=60)
        data = response.json()
        if data.get('success'):
            print("✅ Planilha de Monitoramento atualizada com sucesso.")
        else:
            print(f"❌ Erro ao atualizar planilha: {data.get('error')}")
    except Exception as e:
        print(f"❌ Erro na comunicação com GAS: {e}")

def fetch_google_news(ticker):
    """Busca notícias via Google News RSS para o ticker"""
    clean_ticker = ticker.replace('.SA', '')
    query = urllib.parse.quote(f"{clean_ticker}")
    url = f"https://news.google.com/rss/search?q={query}%20when%3A7d&hl=pt-BR&gl=BR&ceid=BR:pt-419"

    news_items = []
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:10]: # Pegar um pouco mais para filtrar depois
            dt = None
            if hasattr(entry, 'published_parsed'):
                dt = datetime(*entry.published_parsed[:6])

            news_items.append({
                'title': entry.title,
                'link': entry.link,
                'date': dt,
                'source': 'Google News'
            })
    except Exception as e:
        print(f"⚠️ Erro no Google News para {ticker}: {e}")
    return news_items

def fetch_yahoo_news(ticker):
    """Busca notícias via Yahoo Finance"""
    news_items = []
    try:
        t_obj = yf.Ticker(ticker)
        news = t_obj.news
        if not news: return []

        for item in news:
            content = item.get('content', {})
            title = item.get('title') or content.get('title', '')
            link = item.get('link') or content.get('canonicalUrl', {}).get('url') or content.get('clickThroughUrl', {}).get('url')

            dt = None
            ts = item.get('providerPublishTime')
            if ts:
                dt = datetime.fromtimestamp(ts)
            else:
                pub_date = content.get('pubDate') or content.get('pubdate')
                if pub_date:
                    try: dt = datetime.strptime(pub_date, '%Y-%m-%dT%H:%M:%SZ')
                    except:
                        try: dt = datetime.fromisoformat(pub_date.replace('Z', '+00:00'))
                        except: pass

            news_items.append({
                'title': title,
                'link': link,
                'date': dt,
                'source': 'Yahoo Finance'
            })
    except Exception as e:
        print(f"⚠️ Erro no Yahoo Finance para {ticker}: {e}")
    return news_items

def extract_article_content(url):
    try:
        article = Article(url)
        article.download()
        article.parse()
        return article.text
    except Exception as e:
        print(f"   ⚠️ Falha ao extrair conteúdo de {url}: {e}")
        return None

def get_deep_ai_analysis(ticker, news_data):
    if not news_data:
        return "Sem notícias recentes para análise profunda.", "Neutro"

    combined_content = ""
    for idx, item in enumerate(news_data[:3]): # Limite de 3 notícias por ativo conforme pedido
        content = extract_article_content(item['link'])
        if content:
            combined_content += f"\n--- Notícia {idx+1}: {item['title']} ---\n{content}\n"
        else:
            combined_content += f"\n--- Notícia {idx+1}: {item['title']} ---\n(Conteúdo indisponível, apenas título disponível)\n"

    prompt = (
        f"Aja como um analista sênior da B3. Analise o conteúdo das notícias abaixo sobre a empresa {ticker}. "
        f"Forneça um resumo executivo de 3 a 4 frases detalhando os principais pontos e impactos para o investidor. "
        f"Ao final, em uma linha separada, escreva APENAS a palavra que define o sentimento: 'Positivo', 'Negativo' ou 'Neutro'.\n\n"
        f"Conteúdo das Notícias:\n{combined_content}"
    )

    # Lista de provedores atualizada e mais estável
    providers = [
        g4f.Provider.PuterJS,
        g4f.Provider.PollinationsAI,
        g4f.Provider.Liaobots,
        g4f.Provider.Airforce
    ]

    for provider in providers:
        try:
            response = g4f.ChatCompletion.create(
                model="gpt-4o-mini",
                provider=provider,
                messages=[{"role": "user", "content": prompt}],
            )
            if response and len(response) > 50:
                # Separar resumo de sentimento
                lines = response.strip().split('\n')
                sentiment = "Neutro"
                summary_lines = []

                for line in lines:
                    clean_line = line.replace('*', '').replace('#', '').strip()
                    if clean_line in ["Positivo", "Negativo", "Neutro"]:
                        sentiment = clean_line
                    elif clean_line:
                        summary_lines.append(line)

                summary = "\n".join(summary_lines).strip()
                return summary, sentiment
        except Exception as e:
            print(f"   ⚠️ Erro no provedor {provider}: {e}")
            continue

    return "Erro ao gerar análise profunda via IA.", "Neutro"

def main():
    print("🚀 Iniciando Deep News Fetcher (Análise Profunda)...")
    tickers = load_tickers_from_monitoramento()

    if not tickers:
        print("ℹ️ Nenhum ticker encontrado na aba Monitoramento ou erro na API.")
        return

    print(f"📈 Ativos para processar: {tickers}")
    results = []

    now = datetime.now()
    one_week_ago = now - timedelta(days=7)

    for ticker_raw in tickers:
        ticker = ticker_raw.strip().upper()
        if not ticker.endswith('.SA') and '.' not in ticker:
            ticker = f"{ticker}.SA"

        print(f"🔍 Analisando {ticker}...")
        try:
            yahoo_news = fetch_yahoo_news(ticker)
            google_news = fetch_google_news(ticker)
            combined_news = yahoo_news + google_news

            seen_titles = set()
            valid_news = []
            for item in combined_news:
                title_norm = item['title'].lower().strip()
                if title_norm in seen_titles: continue

                if item['date'] and item['date'] >= one_week_ago:
                    valid_news.append(item)
                    seen_titles.add(title_norm)

            # Se não houver notícias da última semana, pega as mais recentes disponíveis
            if not valid_news and combined_news:
                valid_news = sorted(combined_news, key=lambda x: x['date'] if x['date'] else datetime.min, reverse=True)[:3]
            else:
                valid_news = sorted(valid_news, key=lambda x: x['date'] if x['date'] else datetime.min, reverse=True)[:3]

            summary, sentiment = get_deep_ai_analysis(ticker, valid_news)

            results.append({
                "ticker": ticker,
                "summary": summary,
                "sentiment": sentiment,
                "updated_at": datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            })

            print(f"   ✅ {ticker}: {sentiment}")
            time.sleep(1) # Delay para evitar rate limiting

        except Exception as e:
            print(f"❌ Erro ao processar {ticker}: {e}")

    if results:
        update_monitoramento(results)

    print("✅ Deep News Fetcher finalizado.")

if __name__ == "__main__":
    main()
