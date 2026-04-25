import yfinance as yf
import g4f
import json
import os
from datetime import datetime, timedelta
import time
import requests

# Configurações
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
MARKET_SUMMARY_JSON = os.path.join(DATA_DIR, 'market_summary.json')
OUTPUT_JSON = os.path.join(DATA_DIR, 'market_news.json')
GAS_URL = os.environ.get('GAS_URL')

def load_tickers_from_sheets():
    if not GAS_URL:
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
    tickers.update(load_tickers_from_sheets())

    if os.path.exists(MARKET_SUMMARY_JSON):
        try:
            with open(MARKET_SUMMARY_JSON, 'r', encoding='utf-8') as f:
                summary = json.load(f)
            tickers.update([a['ticker'] for a in summary.get('gainers', [])])
            tickers.update([a['ticker'] for a in summary.get('losers', [])])
        except: pass

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

def get_ai_summary(ticker, context, is_priority=False):
    if not context or context.strip() == "":
        return "Sem notícias recentes de impacto encontradas nos principais canais financeiros."

    if not is_priority:
        clean_titles = [t.strip() for t in context.split('.') if len(t.strip()) > 10]
        if clean_titles:
            return f"Movimentações recentes: {'; '.join(clean_titles[:2])}. O mercado monitora o desempenho do papel frente ao setor."
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

def parse_date(item):
    # Tenta vários formatos conhecidos do yfinance
    ts = item.get('providerPublishTime')
    if ts: return datetime.fromtimestamp(ts)

    content = item.get('content', {})
    pub_date = content.get('pubDate') or content.get('pubdate')
    if pub_date:
        try:
            # Formato ISO: 2026-04-24T17:27:01Z
            return datetime.strptime(pub_date, '%Y-%m-%dT%H:%M:%SZ')
        except:
            try:
                # Outro formato comum
                return datetime.fromisoformat(pub_date.replace('Z', '+00:00'))
            except: pass
    return None

def main():
    print("🚀 Iniciando News Fetcher...")
    all_tickers = load_tickers()
    movers = get_market_movers()

    news_output = {
        "last_update": datetime.now().isoformat(),
        "market_summary": "O mercado brasileiro segue atento ao cenário fiscal e movimentações de commodities.",
        "assets": {},
        "market_movers": movers
    }

    processed_count = 0
    total = len(all_tickers)
    sorted_tickers = movers + [t for t in all_tickers if t not in movers]

    now = datetime.now()
    one_week_ago = now - timedelta(days=7)

    for ticker in sorted_tickers:
        processed_count += 1
        if processed_count % 10 == 0:
            print(f"Progresso: {processed_count}/{total}")
        if processed_count > 350: break

        try:
            t_obj = yf.Ticker(ticker)
            news = t_obj.news
            if not news: continue

            valid_news = []
            for item in news:
                dt = parse_date(item)
                if dt and dt >= one_week_ago:
                    valid_news.append(item)

            if not valid_news:
                valid_news = news[:2]

            context = ""
            sources = []
            dates = []

            for item in valid_news[:3]:
                content = item.get('content', {})
                title = item.get('title') or content.get('title', '')

                # Link handling
                link = item.get('link') or content.get('canonicalUrl', {}).get('url') or content.get('clickThroughUrl', {}).get('url')

                dt = parse_date(item)

                if title: context += f"{title}. "
                if link: sources.append(link)
                if dt: dates.append(dt)

            period_str = ""
            if dates:
                min_date = min(dates).strftime('%d/%m/%Y')
                max_date = max(dates).strftime('%d/%m/%Y')
                period_str = f"Em {min_date}" if min_date == max_date else f"De {min_date} a {max_date}"

            is_prio = ticker in movers or processed_count <= 25
            summary = get_ai_summary(ticker, context, is_priority=is_prio)

            news_output["assets"][ticker] = {
                "summary": summary,
                "period": period_str,
                "sources": list(set(sources)), # Deduplicate
                "updated_at": datetime.now().isoformat()
            }
            if is_prio: time.sleep(0.5)

        except Exception as e:
            print(f"Erro em {ticker}: {e}")

    # Geral
    try:
        top_summaries = [f"{t}: {news_output['assets'][t]['summary']}" for t in sorted_tickers[:10] if t in news_output["assets"]]
        if top_summaries:
            combined = "\n".join(top_summaries)
            news_output["market_summary"] = g4f.ChatCompletion.create(
                model="openai",
                provider=g4f.Provider.PollinationsAI,
                messages=[{"role": "user", "content": f"Resuma o clima do mercado B3 hoje em 3 frases:\n{combined}"}],
            )
    except: pass

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(news_output, f, indent=2, ensure_ascii=False)
    print(f"✅ Finalizado! {len(news_output['assets'])} ativos processados.")

if __name__ == "__main__":
    main()
