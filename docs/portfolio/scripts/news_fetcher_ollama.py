import yfinance as yf
import json
import os
from datetime import datetime, timedelta
import time
import requests
import feedparser
import urllib.parse

# Configurações
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
MARKET_SUMMARY_JSON = os.path.join(DATA_DIR, 'market_summary.json')
OUTPUT_JSON = os.path.join(DATA_DIR, 'market_news.json')
GAS_URL = 'https://script.google.com/macros/s/AKfycbwtMb0_J0qQoILBwR6oWXWiPFUzqs3iAFje-7gVFsbmOP9bg7OhrT8oJ0VA01Mytpntww/exec'

# Configurações Ollama
OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "llama3"

def get_ollama_completion(prompt, system_prompt="Você é um analista financeiro sênior especializado no mercado brasileiro (B3)."):
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "stream": False,
        "options": {
            "temperature": 0.3, # Menor temperatura para respostas mais factuais e consistentes
            "top_p": 0.9
        }
    }
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=60)
        if response.status_code == 200:
            result = response.json()
            return result.get('message', {}).get('content', '').strip()
        else:
            print(f"❌ Erro na API do Ollama ({response.status_code}): {response.text}")
    except Exception as e:
        print(f"⚠️ Falha ao conectar com Ollama local: {e}. Verifique se o serviço está rodando e se o modelo {OLLAMA_MODEL} está baixado.")
    return None

def load_tickers_from_sheets():
    if not GAS_URL:
        print("⚠️ GAS_URL não configurada. Buscando apenas ativos locais.")
        return []
    try:
        response = requests.post(GAS_URL, json={"action": "get_all_tickers"}, timeout=30)
        data = response.json()
        if data.get('success'): return data.get('tickers', [])
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

    # 3. Fallback/Priority básicos
    priority = ["PETR4.SA", "VALE3.SA", "ITUB4.SA", "BBDC4.SA", "BBAS3.SA", "MGLU3.SA", "ABEV3.SA", "WEGE3.SA"]
    tickers.update(priority)
    return list(tickers)

def get_market_movers():
    movers = []
    if os.path.exists(MARKET_SUMMARY_JSON):
        try:
            with open(MARKET_SUMMARY_JSON, 'r', encoding='utf-8') as f:
                summary = json.load(f)
            movers.extend([a['ticker'] for a in summary.get('gainers', [])])
            movers.extend([a['ticker'] for a in summary.get('losers', [])])
        except: pass
    return movers

def fetch_google_news(ticker):
    """Busca notícias via Google News RSS para o ticker"""
    clean_ticker = ticker.replace('.SA', '')
    query = urllib.parse.quote(f"{clean_ticker}")
    url = f"https://news.google.com/rss/search?q={query}%20when%3A15d&hl=pt-BR&gl=BR&ceid=BR:pt-419"

    news_items = []
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:5]:
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

def get_ai_summary(ticker, context):
    if not context or context.strip() == "":
        return "Sem notícias recentes de impacto encontradas nos principais canais financeiros."

    prompt = (
        f"Analise e resuma com PROFUNDIDADE as notícias recentes de {ticker}.\n"
        f"Contexto (manchetes): {context}\n\n"
        f"Instruções OBRIGATÓRIAS:\n"
        f"1. NÃO apenas repita os títulos das notícias. Analise o impacto direto no negócio e no preço do papel.\n"
        f"2. Identifique tendências e o sentimento predominante do mercado (otimista, pessimista ou neutro).\n"
        f"3. Responda em português brasileiro de forma fluída e profissional, em um parágrafo de 3 a 4 frases.\n"
        f"4. Seja objetivo e evite clichês."
    )

    summary = get_ollama_completion(prompt)
    if summary:
        return summary

    # Último recurso: extração manual básica se a IA falhar
    clean_titles = [t.strip() for t in context.split('.') if len(t.strip()) > 15]
    if clean_titles:
        return f"Destaques: {'; '.join(clean_titles[:2])}. O mercado monitora o impacto destes fatos no desempenho do papel."

    return f"Resumo: {context[:300]}..."

def main():
    print(f"🚀 Iniciando Local News Fetcher com Ollama ({OLLAMA_MODEL})...")
    all_tickers = load_tickers()
    movers = get_market_movers()

    # Carregar dados de mercado para contexto e exibição
    market_summary_data = {}
    market_last_date = None
    if os.path.exists(MARKET_SUMMARY_JSON):
        try:
            with open(MARKET_SUMMARY_JSON, 'r', encoding='utf-8') as f:
                summary_json = json.load(f)
                market_last_date = summary_json.get('date')
                for a in summary_json.get('all_assets', []):
                    market_summary_data[a['ticker']] = a
        except: pass

    news_output = {
        "last_update": datetime.now().isoformat(),
        "market_last_date": market_last_date,
        "market_summary": "O mercado brasileiro segue atento ao cenário fiscal e movimentações de commodities.",
        "ibov": None,
        "assets": {},
        "market_movers": movers
    }

    if os.path.exists(MARKET_SUMMARY_JSON):
        try:
            with open(MARKET_SUMMARY_JSON, 'r', encoding='utf-8') as f:
                ms_data = json.load(f)
                news_output["ibov"] = ms_data.get('ibov')
        except: pass

    processed_count = 0
    total = len(all_tickers)
    sorted_tickers = movers + [t for t in all_tickers if t not in movers]

    now = datetime.now()
    one_week_ago = now - timedelta(days=7)

    for ticker in sorted_tickers:
        processed_count += 1
        if processed_count % 10 == 0: print(f"Progresso: {processed_count}/{total}")
        if processed_count > 350: break

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

            if not valid_news and combined_news:
                valid_news = sorted(combined_news, key=lambda x: x['date'] if x['date'] else datetime.min, reverse=True)[:2]

            context = ""
            sources = []
            dates = []
            valid_news.sort(key=lambda x: x['date'] if x['date'] else datetime.min, reverse=True)

            for item in valid_news[:4]:
                if item['title']: context += f"[{item['source']}] {item['title']}. "
                if item['link']: sources.append(item['link'])
                if item['date']: dates.append(item['date'])

            period_str = ""
            max_news_date_str = None
            if dates:
                min_date = min(dates)
                max_date = max(dates)
                min_date_str = min_date.strftime('%d/%m/%Y')
                max_date_str = max_date.strftime('%d/%m/%Y')
                max_news_date_str = max_date.strftime('%Y-%m-%d')
                period_str = f"Em {min_date_str}" if min_date_str == max_date_str else f"De {min_date_str} a {max_date_str}"

            # Verificar se a notícia é anterior à data do mercado
            is_outdated = False
            if market_last_date and max_news_date_str:
                if max_news_date_str < market_last_date:
                    is_outdated = True

            summary = get_ai_summary(ticker, context)

            asset_market_info = market_summary_data.get(ticker, {})

            news_output["assets"][ticker] = {
                "summary": summary,
                "period": period_str,
                "sources": list(dict.fromkeys(sources)),
                "updated_at": datetime.now().isoformat(),
                "is_outdated": is_outdated,
                "last_close": asset_market_info.get('last_close'),
                "daily_delta": asset_market_info.get('daily_delta'),
                "monthly_delta": asset_market_info.get('monthly_delta'),
                "yearly_delta": asset_market_info.get('yearly_delta'),
                "price_date": asset_market_info.get('date')
            }
            # No Ollama local não precisamos de tanto delay quanto no Gemini Free, mas mantemos por precaução de recursos
            time.sleep(0.1)

        except Exception as e:
            print(f"Erro em {ticker}: {e}")

    try:
        # Melhorar o resumo geral separando ganhadores e perdedores
        gainers = []
        losers = []
        if os.path.exists(MARKET_SUMMARY_JSON):
            with open(MARKET_SUMMARY_JSON, 'r', encoding='utf-8') as f:
                ms = json.load(f)
                gainers = [a['ticker'] for a in ms.get('gainers', [])]
                losers = [a['ticker'] for a in ms.get('losers', [])]

        gainers_summaries = [f"{t}: {news_output['assets'][t]['summary']}" for t in gainers if t in news_output["assets"]]
        losers_summaries = [f"{t}: {news_output['assets'][t]['summary']}" for t in losers if t in news_output["assets"]]

        ibov_info = ""
        if news_output.get("ibov"):
            i = news_output["ibov"]
            ibov_info = f"O IBOVESPA fechou em {i['last_close']:.0f} pontos, com variação de {i['daily_delta']*100:.2f}% no dia, {i['monthly_delta']*100:.2f}% no mês e {i['yearly_delta']*100:.2f}% no ano.\n"

        prompt_summary = (
            f"Aja como um analista financeiro sênior. {ibov_info}Resuma o clima do mercado B3 hoje em 3 a 4 frases analíticas e conectadas.\n"
            f"Sintetize as principais movimentações e a tendência do dia com base nos destaques abaixo.\n"
        )
        if gainers_summaries:
            prompt_summary += f"Destaques de alta:\n" + "\n".join(gainers_summaries) + "\n"
        if losers_summaries:
            prompt_summary += f"Destaques de baixa:\n" + "\n".join(losers_summaries) + "\n"

        overall_summary = get_ollama_completion(prompt_summary)
        if overall_summary:
            news_output["market_summary"] = overall_summary

    except Exception as e:
        print(f"Erro no resumo geral IA: {e}")

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(news_output, f, indent=2, ensure_ascii=False)
    print(f"✅ Finalizado! {len(news_output['assets'])} ativos processados. Arquivo salvo em {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
