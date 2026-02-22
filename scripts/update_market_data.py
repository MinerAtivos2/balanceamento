import os
import yfinance as yf
from supabase import create_client, Client
import json
from datetime import datetime

# Supabase Credentials from Environment Variables
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def update_market_data():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Erro: SUPABASE_URL ou SUPABASE_KEY não configurados.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. Buscar tickers únicos das posições dos usuários
    try:
        response = supabase.table("positions").select("ticker").execute()
        tickers = list(set([item['ticker'] for item in response.data]))
        print(f"Tickers encontrados: {tickers}")
    except Exception as e:
        print(f"Erro ao buscar tickers: {e}")
        return

    if not tickers:
        print("Nenhum ticker encontrado nas posições.")
        return

    # 2. Buscar dados no Yahoo Finance e salvar no Supabase
    for ticker in tickers:
        print(f"Processando {ticker}...")
        try:
            # Yahoo Finance utiliza .SA para B3
            yf_ticker = ticker
            asset = yf.Ticker(yf_ticker)

            # Preço Atual
            info = asset.fast_info
            last_price = info['last_price']

            # Histórico (último 1 ano, mensal)
            history = asset.history(period="1y", interval="1mo")
            history_data = {
                "closes": history['Close'].tolist(),
                "dates": [d.strftime('%Y-%m-%d') for d in history.index]
            }

            # Dividendos
            actions = asset.actions
            dividends = actions[actions['Dividends'] > 0]
            dividend_data = {
                "values": dividends['Dividends'].tolist(),
                "dates": [d.strftime('%Y-%m-%d') for d in dividends.index]
            }

            # Preparar objeto para o banco
            market_entry = {
                "ticker": ticker,
                "name": asset.info.get('longName', ticker),
                "last_price": last_price,
                "history": history_data,
                "dividends": dividend_data,
                "updated_at": datetime.utcnow().isoformat()
            }

            # 3. Upsert no Supabase (tabela market_data)
            supabase.table("market_data").upsert(market_entry).execute()
            print(f"Sucesso: {ticker} atualizado.")

        except Exception as e:
            print(f"Erro ao processar {ticker}: {e}")

if __name__ == "__main__":
    update_market_data()
