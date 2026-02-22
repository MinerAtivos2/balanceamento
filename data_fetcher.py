#!/usr/bin/env python3
"""
Data Fetcher - Coleta dados de ativos B3 via yfinance
Executa coleta de histórico de preços e informações de dividendos
"""

import json
import os
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd

# Configurações
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
OUTPUT_FILE = os.path.join(DATA_DIR, 'market_data.json')
CACHE_DIR = os.path.join(DATA_DIR, 'cache')

# Ativos B3 populares para exemplo
DEFAULT_ASSETS = [
    'PETR4.SA',  # Petrobras
    'VALE3.SA',  # Vale
    'ITUB4.SA',  # Itaú
    'BBDC4.SA',  # Bradesco
    'ABEV3.SA',  # Ambev
    'WEGE3.SA',  # WEG
    'JBSS3.SA',  # JBS
    'LREN3.SA',  # Lojas Renner
    'MGLU3.SA',  # Magazine Luiza
    'ASAI3.SA',  # Assaí
]

def fetch_asset_data(ticker, period='5y'):
    """
    Coleta dados históricos de um ativo
    
    Args:
        ticker: Código do ativo (ex: PETR4.SA)
        period: Período de dados (default: 5 anos)
    
    Returns:
        dict: Dados do ativo ou None se erro
    """
    try:
        print(f"Coletando dados de {ticker}...")
        
        # Coleta dados históricos
        asset = yf.Ticker(ticker)
        hist = asset.history(period=period)
        
        if hist.empty:
            print(f"  ⚠️  Nenhum dado encontrado para {ticker}")
            return None
        
        # Coleta informações gerais
        info = asset.info
        
        # Coleta histórico de dividendos
        dividends = asset.dividends
        
        # Prepara dados de retorno
        asset_data = {
            'ticker': ticker,
            'name': info.get('longName', ticker),
            'sector': info.get('sector', 'N/A'),
            'currency': info.get('currency', 'BRL'),
            'last_price': float(hist['Close'].iloc[-1]) if not hist.empty else None,
            'last_update': datetime.now().isoformat(),
            'history': {
                'dates': hist.index.strftime('%Y-%m-%d').tolist(),
                'closes': hist['Close'].round(2).tolist(),
                'volumes': hist['Volume'].astype(int).tolist(),
            },
            'dividends': {
                'dates': dividends.index.strftime('%Y-%m-%d').tolist(),
                'values': dividends.round(4).tolist(),
            } if not dividends.empty else {'dates': [], 'values': []},
            'stats': {
                'avg_price': float(hist['Close'].mean()),
                'min_price': float(hist['Close'].min()),
                'max_price': float(hist['Close'].max()),
                'volatility': float(hist['Close'].pct_change().std() * 100),
            }
        }
        
        print(f"  ✓ {ticker} coletado com sucesso")
        return asset_data
        
    except Exception as e:
        print(f"  ✗ Erro ao coletar {ticker}: {str(e)}")
        return None

def fetch_all_assets(assets=None):
    """
    Coleta dados de múltiplos ativos
    
    Args:
        assets: Lista de tickers (usa DEFAULT_ASSETS se None)
    
    Returns:
        dict: Dados de todos os ativos
    """
    if assets is None:
        assets = DEFAULT_ASSETS
    
    print(f"\n{'='*60}")
    print(f"Iniciando coleta de dados - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")
    
    all_data = {
        'timestamp': datetime.now().isoformat(),
        'assets': {},
        'summary': {
            'total_assets': len(assets),
            'successful': 0,
            'failed': 0,
        }
    }
    
    for ticker in assets:
        data = fetch_asset_data(ticker)
        if data:
            all_data['assets'][ticker] = data
            all_data['summary']['successful'] += 1
        else:
            all_data['summary']['failed'] += 1
    
    print(f"\n{'='*60}")
    print(f"Coleta finalizada!")
    print(f"  Sucesso: {all_data['summary']['successful']}")
    print(f"  Falhas: {all_data['summary']['failed']}")
    print(f"{'='*60}\n")
    
    return all_data

def save_data(data, output_file=OUTPUT_FILE):
    """Salva dados em arquivo JSON"""
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✓ Dados salvos em: {output_file}")

def main():
    """Função principal"""
    # Coleta dados
    data = fetch_all_assets()
    
    # Salva dados
    save_data(data)
    
    return data

if __name__ == '__main__':
    main()
