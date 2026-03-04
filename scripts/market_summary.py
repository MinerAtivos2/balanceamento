#!/usr/bin/env python3
"""
Market Summary - Gera resumo diário de ganhos e perdas
"""

import json
import os
from datetime import datetime

# Configurações
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
MARKET_DATA_FILE = os.path.join(DATA_DIR, 'market_data.json')
SUMMARY_JSON = os.path.join(DATA_DIR, 'market_summary.json')
SUMMARY_MD = os.path.join(DATA_DIR, 'market_summary.md')

def calculate_deltas():
    if not os.path.exists(MARKET_DATA_FILE):
        print(f"❌ Arquivo {MARKET_DATA_FILE} não encontrado.")
        return None

    with open(MARKET_DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    assets_data = data.get('assets', {})
    summary_list = []

    for ticker, info in assets_data.items():
        history = info.get('history', {})
        dates = history.get('dates', [])
        closes = history.get('closes', [])

        if len(dates) >= 2 and len(closes) >= 2:
            last_close = closes[-1]
            prev_close = closes[-2]

            if prev_close and prev_close > 0:
                delta = (last_close / prev_close) - 1
                summary_list.append({
                    'ticker': ticker,
                    'name': info.get('name', ticker),
                    'last_close': last_close,
                    'prev_close': prev_close,
                    'delta': delta,
                    'date': dates[-1]
                })

    if not summary_list:
        print("⚠️ Nenhum dado suficiente para calcular variações.")
        return None

    # Ordenar por delta
    sorted_assets = sorted(summary_list, key=lambda x: x['delta'], reverse=True)

    top_gainers = sorted_assets[:5]
    top_losers = sorted_assets[-5:][::-1] # 5 piores, do pior para o menos pior

    return {
        'last_update': data.get('timestamp'),
        'date': summary_list[0]['date'] if summary_list else None,
        'gainers': top_gainers,
        'losers': top_losers
    }

def format_markdown(summary):
    date_str = summary['date']
    md = f"## Resumo de Mercado - {date_str}\n\n"

    md += "### 📈 Maiores Altas\n\n"
    md += "| Ativo | Nome | Fechamento | Anterior | Variação |\n"
    md += "| :--- | :--- | :--- | :--- | :--- |\n"
    for a in summary['gainers']:
        delta_pct = a['delta'] * 100
        md += f"| {a['ticker']} | {a['name']} | R$ {a['last_close']:.2f} | R$ {a['prev_close']:.2f} | **+{delta_pct:.2f}%** 🚀 |\n"

    md += "\n### 📉 Maiores Baixas\n\n"
    md += "| Ativo | Nome | Fechamento | Anterior | Variação |\n"
    md += "| :--- | :--- | :--- | :--- | :--- |\n"
    for a in summary['losers']:
        delta_pct = a['delta'] * 100
        md += f"| {a['ticker']} | {a['name']} | R$ {a['last_close']:.2f} | R$ {a['prev_close']:.2f} | **{delta_pct:.2f}%** 📉 |\n"

    return md

def main():
    print("Gerando resumo de mercado...")
    summary = calculate_deltas()

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
