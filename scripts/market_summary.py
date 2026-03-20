#!/usr/bin/env python3
"""
Market Summary - Gera resumo diário de ganhos e perdas, incluindo dados para Treemap
"""

import json
import os
from datetime import datetime, timedelta

# Configurações
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
MARKET_DATA_FILE = os.path.join(DATA_DIR, 'market_data.json')
SUMMARY_JSON = os.path.join(DATA_DIR, 'market_summary.json')
SUMMARY_MD = os.path.join(DATA_DIR, 'market_summary.md')

def calculate_variations():
    if not os.path.exists(MARKET_DATA_FILE):
        print(f"❌ Arquivo {MARKET_DATA_FILE} não encontrado.")
        return None

    with open(MARKET_DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    assets_data = data.get('assets', {})

    # Definir data atual e anterior de referência (baseado em VALE3 e PETR4)
    ref_tickers = ['VALE3.SA', 'PETR4.SA']
    ref_dates = []
    for t in ref_tickers:
        if t in assets_data:
            dates = assets_data[t].get('history', {}).get('dates', [])
            if len(dates) >= 2:
                ref_dates.append((dates[-1], dates[-2]))

    if not ref_dates:
        print("❌ Não foi possível determinar as datas de referência de mercado.")
        return None

    # Usar a data mais comum entre os ativos de referência
    from collections import Counter
    market_current_date, market_prev_date = Counter(ref_dates).most_common(1)[0][0]
    print(f"📅 Datas de referência: Atual={market_current_date}, Anterior={market_prev_date}")

    all_assets_summary = []

    for ticker, info in assets_data.items():
        history = info.get('history', {})
        dates = history.get('dates', [])
        closes = history.get('closes', [])

        if not dates or not closes or len(dates) < 2:
            continue

        # FILTRO: Apenas ativos que negociaram exatamente nas datas de referência
        if dates[-1] != market_current_date or dates[-2] != market_prev_date:
            continue

        asset_summary = {
            'ticker': ticker,
            'name': info.get('name', ticker),
            'last_close': closes[-1],
            'date': dates[-1],
            'daily_delta': 0,
            'monthly_delta': 0
        }

        # Daily Delta
        prev_close = closes[-2]
        if prev_close and prev_close > 0:
            asset_summary['daily_delta'] = (closes[-1] / prev_close) - 1
            asset_summary['prev_close'] = prev_close

        # Monthly Delta (approx 30 days ago)
        # We look for the price closest to 30 days before the last date
        try:
            last_date = datetime.strptime(dates[-1], '%Y-%m-%d')
            target_date = last_date - timedelta(days=30)
            target_date_str = target_date.strftime('%Y-%m-%d')

            # Find closest date index that is <= target_date_str
            # Since dates are sorted, we can search
            month_idx = 0
            for i, d in enumerate(dates):
                if d <= target_date_str:
                    month_idx = i
                else:
                    break

            month_close = closes[month_idx]
            if month_close and month_close > 0:
                asset_summary['monthly_delta'] = (closes[-1] / month_close) - 1
        except Exception as e:
            print(f"⚠️ Erro ao calcular delta mensal para {ticker}: {e}")

        all_assets_summary.append(asset_summary)

    if not all_assets_summary:
        print("⚠️ Nenhum dado suficiente para calcular variações.")
        return None

    # Top Gainers/Losers based on daily delta
    valid_daily = [a for a in all_assets_summary if 'prev_close' in a]
    sorted_daily = sorted(valid_daily, key=lambda x: x['daily_delta'], reverse=True)

    top_gainers = sorted_daily[:5]
    top_losers = sorted_daily[-5:][::-1]

    return {
        'last_update': data.get('timestamp'),
        'date': all_assets_summary[0]['date'] if all_assets_summary else None,
        'gainers': top_gainers,
        'losers': top_losers,
        'all_assets': all_assets_summary
    }

def format_markdown(summary):
    date_str = summary['date']
    md = f"## Resumo de Mercado - {date_str}\n\n"

    md += "### 📈 Maiores Altas (Dia)\n\n"
    md += "| Ativo | Nome | Fechamento | Anterior | Variação |\n"
    md += "| :--- | :--- | :--- | :--- | :--- |\n"
    for a in summary['gainers']:
        delta_pct = a['daily_delta'] * 100
        md += f"| {a['ticker']} | {a['name']} | R$ {a['last_close']:.2f} | R$ {a.get('prev_close', 0):.2f} | **+{delta_pct:.2f}%** 🚀 |\n"

    md += "\n### 📉 Maiores Baixas (Dia)\n\n"
    md += "| Ativo | Nome | Fechamento | Anterior | Variação |\n"
    md += "| :--- | :--- | :--- | :--- | :--- |\n"
    for a in summary['losers']:
        delta_pct = a['daily_delta'] * 100
        md += f"| {a['ticker']} | {a['name']} | R$ {a['last_close']:.2f} | R$ {a.get('prev_close', 0):.2f} | **{delta_pct:.2f}%** 📉 |\n"

    return md

def main():
    print("Gerando resumo de mercado e dados para Treemap...")
    summary = calculate_variations()

    if summary:
        # Salvar JSON
        with open(SUMMARY_JSON, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        print(f"✓ Resumo JSON salvo em: {SUMMARY_JSON}")

        # Salvar Markdown
        md_content = format_markdown(summary)
        with open(SUMMARY_MD, 'w', encoding='utf-8') as f:
            f.write(md_content)
        print(f"✓ Resumo Markdown salvo em: {SUMMARY_MD}")
    else:
        print("❌ Não foi possível gerar o resumo.")

if __name__ == "__main__":
    main()
