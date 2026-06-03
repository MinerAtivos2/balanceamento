import yfinance as yf
import g4f
import json
import os
from datetime import datetime, timedelta
import time
import random
import requests
import feedparser
import urllib.parse
from newspaper import Article

# Configurações
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
GAS_URL = 'https://script.google.com/macros/s/AKfycbyH2wrJBEMXBZHyTIIkeaRoI5vIYUgjX60rXqlAh6lZKEYWkZEEI9TxhbKu_pf4cD-C/exec'

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

    # Configurações otimizadas para ambientes headless (GitHub Actions)
    # Evitamos provedores que pedem .har ou browser proof
    configs = [
        {"model": "gpt-4o-mini", "provider": "Airforce"},
        {"model": "gpt-4o", "provider": "Airforce"},
        {"model": "gpt-4o", "provider": "Blackbox"},
        {"model": "openai", "provider": "PollinationsAI"}, # Pollinations usa 'openai' como alias para o modelo default
        {"model": "gpt-4o", "provider": "ChatGptEs"},
        {"model": "gpt-4o", "provider": "Liaobots"},
        {"model": "gpt-4o", "provider": "DuckDuckGo"},
        {"model": "gpt-4o", "provider": "AmigoChat"},
        {"model": "gpt-4o", "provider": ""},
    ]

    # Embaralhar para evitar bater sempre no mesmo provider primeiro (ajuda com rate limits)
    random.shuffle(configs)

    for config in configs:
        p_name = config["provider"]
        model = config["model"]

        try:
            provider = None
            if p_name:
                if not hasattr(g4f.Provider, p_name): continue
                provider = getattr(g4f.Provider, p_name)
                # Pula se o provider explicitamente marcar que precisa de auth ou browser
                if hasattr(provider, 'needs_auth') and provider.needs_auth: continue

            model_arg = model if model else "gpt-4o"

            response = g4f.ChatCompletion.create(
                model=model_arg,
                provider=provider,
                messages=[{"role": "user", "content": prompt}],
                timeout=45 # Timeout para não travar a action
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
            print(f"   ⚠️ Erro no provedor {p_name}: {e}")
            # Pequeno delay aleatório entre retentativas se falhar por rate limit ou erro
            time.sleep(random.uniform(1, 3))
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
        ticker_original = ticker_raw.strip()
        ticker_yf = ticker_original.upper()
        if not ticker_yf.endswith('.SA') and '.' not in ticker_yf:
            ticker_yf = f"{ticker_yf}.SA"

        print(f"🔍 Analisando {ticker_original} (Yahoo: {ticker_yf})...")
        try:
            yahoo_news = fetch_yahoo_news(ticker_yf)
            google_news = fetch_google_news(ticker_yf)
            combined_news = yahoo_news + google_news

            seen_titles = set()
            valid_news = []
            for item in combined_news:
                title_norm = item['title'].lower().strip()
                if title_norm in seen_titles: continue

                # Normalizar datetime para offset-naive para comparação segura
                item_date = item['date']
                if item_date and item_date.tzinfo is not None:
                    item_date = item_date.replace(tzinfo=None)

                if item_date and item_date >= one_week_ago:
                    valid_news.append(item)
                    seen_titles.add(title_norm)

            # Se não houver notícias da última semana, pega as mais recentes disponíveis
            def get_date(x):
                dt = x.get('date')
                if dt and dt.tzinfo is not None:
                    return dt.replace(tzinfo=None)
                return dt if dt else datetime.min

            if not valid_news and combined_news:
                valid_news = sorted(combined_news, key=get_date, reverse=True)[:3]
            else:
                valid_news = sorted(valid_news, key=get_date, reverse=True)[:3]

            summary, sentiment = get_deep_ai_analysis(ticker_yf, valid_news)

            sources = [item['link'] for item in valid_news if item.get('link')]
            sources_str = "\n".join(list(dict.fromkeys(sources))) # Remover duplicados e unir com quebra de linha

            results.append({
                "ticker": ticker_original, # Usar o nome original para o GAS encontrar a linha correta
                "summary": summary,
                "sentiment": sentiment,
                "sources": sources_str,
                "updated_at": datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            })

            print(f"   ✅ {ticker_original}: {sentiment}")
            time.sleep(1) # Delay para evitar rate limiting

        except Exception as e:
            print(f"❌ Erro ao processar {ticker_original}: {e}")

    if results:
        update_monitoramento(results)

    print("✅ Deep News Fetcher finalizado.")

if __name__ == "__main__":
    main()
