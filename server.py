#!/usr/bin/env python3
"""
B3 Rebalanceamento & IA — Flask Web Server
Serves the frontend and exposes API endpoints for portfolio analysis.
"""

import json
import os
import traceback
from datetime import datetime

import numpy as np
from flask import Flask, jsonify, request, send_from_directory

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")
ASSETS_FILE = os.path.join(BASE_DIR, "assets.json")
PORTFOLIO_FILE = os.path.join(BASE_DIR, "sample_portfolio.json")

app = Flask(__name__, static_folder=STATIC_DIR)

os.makedirs(DATA_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _load_json(path, default=None):
    """Safely load a JSON file."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _save_json(path, data):
    """Save data as JSON."""
    os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _fetch_ticker_data(ticker: str, period: str = "5y"):
    """Fetch historical data for a single ticker via yfinance."""
    import yfinance as yf

    asset = yf.Ticker(ticker)
    hist = asset.history(period=period)
    if hist.empty:
        return None

    info = asset.info
    dividends = asset.dividends

    return {
        "ticker": ticker,
        "name": info.get("longName", ticker),
        "sector": info.get("sector", "N/A"),
        "currency": info.get("currency", "BRL"),
        "last_price": float(hist["Close"].iloc[-1]),
        "last_update": datetime.now().isoformat(),
        "history": {
            "dates": hist.index.strftime("%Y-%m-%d").tolist(),
            "closes": [round(float(c), 2) for c in hist["Close"].tolist()],
            "volumes": [int(v) for v in hist["Volume"].tolist()],
        },
        "dividends": {
            "dates": dividends.index.strftime("%Y-%m-%d").tolist(),
            "values": [round(float(v), 4) for v in dividends.tolist()],
        }
        if not dividends.empty
        else {"dates": [], "values": []},
        "stats": {
            "avg_price": round(float(hist["Close"].mean()), 2),
            "min_price": round(float(hist["Close"].min()), 2),
            "max_price": round(float(hist["Close"].max()), 2),
            "volatility": round(float(hist["Close"].pct_change().std() * 100), 4),
        },
    }


# ---------------------------------------------------------------------------
# Example / fallback market data (used when yfinance is unavailable)
# ---------------------------------------------------------------------------
EXAMPLE_MARKET_DATA = {
    "timestamp": datetime.now().isoformat(),
    "assets": {
        "PETR4.SA": {
            "ticker": "PETR4.SA",
            "name": "Petrobras",
            "sector": "Energia",
            "last_price": 38.72,
            "dividends": {"dates": ["2024-06-01", "2024-12-01"], "values": [1.55, 1.80]},
            "history": {
                "dates": ["2024-01-02", "2024-04-01", "2024-07-01", "2024-10-01", "2025-01-02"],
                "closes": [36.50, 37.10, 38.00, 37.80, 38.72],
                "volumes": [12000000, 11500000, 13000000, 12800000, 11200000],
            },
            "stats": {"avg_price": 37.62, "min_price": 33.10, "max_price": 42.15, "volatility": 2.41},
        },
        "VALE3.SA": {
            "ticker": "VALE3.SA",
            "name": "Vale",
            "sector": "Mineração",
            "last_price": 58.90,
            "dividends": {"dates": ["2024-03-15", "2024-09-15"], "values": [2.10, 1.95]},
            "history": {
                "dates": ["2024-01-02", "2024-04-01", "2024-07-01", "2024-10-01", "2025-01-02"],
                "closes": [62.30, 60.50, 57.80, 59.10, 58.90],
                "volumes": [9500000, 10200000, 9800000, 10500000, 9300000],
            },
            "stats": {"avg_price": 59.72, "min_price": 54.20, "max_price": 68.50, "volatility": 1.87},
        },
        "ITUB4.SA": {
            "ticker": "ITUB4.SA",
            "name": "Itaú Unibanco",
            "sector": "Financeiro",
            "last_price": 34.15,
            "dividends": {"dates": ["2024-06-01", "2024-12-01"], "values": [0.85, 0.92]},
            "history": {
                "dates": ["2024-01-02", "2024-04-01", "2024-07-01", "2024-10-01", "2025-01-02"],
                "closes": [31.20, 32.50, 33.10, 33.80, 34.15],
                "volumes": [14000000, 13500000, 14200000, 13800000, 13200000],
            },
            "stats": {"avg_price": 32.95, "min_price": 28.50, "max_price": 35.20, "volatility": 2.05},
        },
        "BBDC4.SA": {
            "ticker": "BBDC4.SA",
            "name": "Bradesco",
            "sector": "Financeiro",
            "last_price": 14.80,
            "dividends": {"dates": ["2024-06-01", "2024-12-01"], "values": [0.42, 0.45]},
            "history": {
                "dates": ["2024-01-02", "2024-04-01", "2024-07-01", "2024-10-01", "2025-01-02"],
                "closes": [15.20, 14.90, 14.50, 14.60, 14.80],
                "volumes": [18000000, 17500000, 16800000, 17200000, 16500000],
            },
            "stats": {"avg_price": 14.80, "min_price": 12.10, "max_price": 16.50, "volatility": 2.32},
        },
        "ABEV3.SA": {
            "ticker": "ABEV3.SA",
            "name": "Ambev",
            "sector": "Consumo",
            "last_price": 11.95,
            "dividends": {"dates": ["2024-04-01", "2024-10-01"], "values": [0.35, 0.38]},
            "history": {
                "dates": ["2024-01-02", "2024-04-01", "2024-07-01", "2024-10-01", "2025-01-02"],
                "closes": [12.80, 12.30, 11.90, 12.10, 11.95],
                "volumes": [22000000, 21500000, 20800000, 21200000, 20500000],
            },
            "stats": {"avg_price": 12.21, "min_price": 10.80, "max_price": 13.50, "volatility": 1.65},
        },
        "WEGE3.SA": {
            "ticker": "WEGE3.SA",
            "name": "WEG",
            "sector": "Indústria",
            "last_price": 52.40,
            "dividends": {"dates": ["2024-05-01", "2024-11-01"], "values": [0.28, 0.31]},
            "history": {
                "dates": ["2024-01-02", "2024-04-01", "2024-07-01", "2024-10-01", "2025-01-02"],
                "closes": [38.50, 42.10, 45.80, 49.20, 52.40],
                "volumes": [5500000, 5800000, 6200000, 5900000, 6100000],
            },
            "stats": {"avg_price": 45.60, "min_price": 35.20, "max_price": 54.80, "volatility": 1.92},
        },
    },
}


# ---------------------------------------------------------------------------
# Static file routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(STATIC_DIR, path)


# ---------------------------------------------------------------------------
# API — Assets catalogue
# ---------------------------------------------------------------------------
@app.route("/api/assets")
def api_assets():
    data = _load_json(ASSETS_FILE, {"assets": []})
    return jsonify(data)


# ---------------------------------------------------------------------------
# API — Portfolio CRUD
# ---------------------------------------------------------------------------
@app.route("/api/portfolio", methods=["GET"])
def api_get_portfolio():
    data = _load_json(PORTFOLIO_FILE, {"name": "Meu Portfólio", "positions": []})
    return jsonify(data)


@app.route("/api/portfolio", methods=["POST"])
def api_save_portfolio():
    data = request.get_json(force=True)
    _save_json(PORTFOLIO_FILE, data)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# API — Market data (try yfinance, fall back to example)
# ---------------------------------------------------------------------------
@app.route("/api/market-data")
def api_market_data():
    cached = os.path.join(DATA_DIR, "market_data.json")
    data = _load_json(cached)
    if data:
        return jsonify(data)
    return jsonify(EXAMPLE_MARKET_DATA)


@app.route("/api/fetch-market-data", methods=["POST"])
def api_fetch_market_data():
    """Fetch fresh data from yfinance for the given tickers."""
    body = request.get_json(force=True)
    tickers = body.get("tickers", [])
    if not tickers:
        assets = _load_json(ASSETS_FILE, {"assets": []})
        tickers = [a["ticker"] for a in assets.get("assets", [])]

    result = {"timestamp": datetime.now().isoformat(), "assets": {}, "summary": {"successful": 0, "failed": 0}}
    for t in tickers:
        try:
            d = _fetch_ticker_data(t)
            if d:
                result["assets"][t] = d
                result["summary"]["successful"] += 1
            else:
                result["summary"]["failed"] += 1
        except Exception:
            result["summary"]["failed"] += 1

    # Cache
    _save_json(os.path.join(DATA_DIR, "market_data.json"), result)
    return jsonify(result)


# ---------------------------------------------------------------------------
# API — Portfolio analysis
# ---------------------------------------------------------------------------
@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """Run portfolio analysis using local market data."""
    body = request.get_json(force=True)
    portfolio = body.get("portfolio", {})  # {ticker: qty}

    # Load market data
    market_data = _load_json(os.path.join(DATA_DIR, "market_data.json"))
    if not market_data:
        market_data = EXAMPLE_MARKET_DATA

    positions = []
    total_value = 0

    for ticker, qty in portfolio.items():
        if ticker not in market_data["assets"]:
            continue
        asset = market_data["assets"][ticker]
        price = asset["last_price"]
        value = price * qty

        closes = asset["history"]["closes"]
        avg_1y = float(np.mean(closes[-252:])) if len(closes) >= 252 else float(np.mean(closes))
        rent = ((price - avg_1y) / avg_1y * 100) if avg_1y > 0 else 0

        positions.append(
            {
                "ticker": ticker,
                "name": asset["name"],
                "sector": asset.get("sector", "N/A"),
                "quantity": qty,
                "current_price": round(price, 2),
                "position_value": round(value, 2),
                "rentability_1y": round(rent, 2),
                "volatility": round(asset["stats"]["volatility"], 2),
            }
        )
        total_value += value

    # Allocation percentages
    allocation = {}
    for p in positions:
        allocation[p["ticker"]] = round(p["position_value"] / total_value * 100, 2) if total_value else 0

    avg_rent = float(np.mean([p["rentability_1y"] for p in positions])) if positions else 0
    avg_vol = float(np.mean([p["volatility"] for p in positions])) if positions else 0

    analysis = {
        "timestamp": datetime.now().isoformat(),
        "positions": positions,
        "allocation": allocation,
        "summary": {
            "total_value": round(total_value, 2),
            "num_positions": len(positions),
            "avg_rentability": round(avg_rent, 2),
            "portfolio_volatility": round(avg_vol, 2),
        },
    }

    _save_json(os.path.join(DATA_DIR, "portfolio_analysis.json"), analysis)
    return jsonify(analysis)


# ---------------------------------------------------------------------------
# API — Barsi price‑ceiling analysis
# ---------------------------------------------------------------------------
@app.route("/api/barsi", methods=["POST"])
def api_barsi():
    body = request.get_json(force=True)
    tickers = body.get("tickers", [])
    target_yield = body.get("target_yield", 6.0)

    market_data = _load_json(os.path.join(DATA_DIR, "market_data.json"))
    if not market_data:
        market_data = EXAMPLE_MARKET_DATA

    analyses = []
    for ticker in tickers:
        if ticker not in market_data["assets"]:
            continue
        asset = market_data["assets"][ticker]
        divs = asset.get("dividends", {})
        div_values = divs.get("values", [])

        if not div_values:
            analyses.append(
                {
                    "ticker": ticker,
                    "name": asset["name"],
                    "current_price": asset["last_price"],
                    "price_ceiling": None,
                    "margin_of_safety": 0,
                    "recommendation": "SEM DADOS - Sem histórico de dividendos",
                    "dpa_avg": 0,
                    "current_yield": 0,
                }
            )
            continue

        dpa_values = np.array(div_values, dtype=float)
        # Annualised DPA: sum of dividends in last available data
        # Use average of all dividends * approximate frequency
        dpa_avg = float(np.mean(dpa_values))
        annual_dpa = float(np.sum(dpa_values[-4:])) if len(dpa_values) >= 4 else float(np.sum(dpa_values))

        price = asset["last_price"]
        price_ceiling = (annual_dpa / (target_yield / 100)) if target_yield > 0 else 0
        margin = ((price_ceiling - price) / price * 100) if price > 0 else 0
        current_yield = (annual_dpa / price * 100) if price > 0 else 0

        if margin > 20:
            rec = "COMPRAR - Preço abaixo do teto com boa margem"
        elif margin > 0:
            rec = "COMPRAR - Preço abaixo do teto"
        elif margin > -10:
            rec = "MANTER - Preço próximo ao teto"
        else:
            rec = "VENDER - Preço acima do teto"

        analyses.append(
            {
                "ticker": ticker,
                "name": asset["name"],
                "current_price": round(price, 2),
                "price_ceiling": round(price_ceiling, 2),
                "margin_of_safety": round(margin, 2),
                "recommendation": rec,
                "dpa_avg": round(dpa_avg, 4),
                "current_yield": round(current_yield, 2),
            }
        )

    # Sort by margin descending
    analyses.sort(key=lambda x: x.get("margin_of_safety", -999), reverse=True)

    result = {
        "timestamp": datetime.now().isoformat(),
        "target_yield": target_yield,
        "analyses": analyses,
        "summary": {
            "total_analyzed": len(analyses),
            "buy_signals": sum(1 for a in analyses if "COMPRAR" in a["recommendation"]),
            "hold_signals": sum(1 for a in analyses if "MANTER" in a["recommendation"]),
            "sell_signals": sum(1 for a in analyses if "VENDER" in a["recommendation"]),
        },
    }
    _save_json(os.path.join(DATA_DIR, "barsi_analysis.json"), result)
    return jsonify(result)


# ---------------------------------------------------------------------------
# API — Markowitz portfolio optimisation
# ---------------------------------------------------------------------------
@app.route("/api/rebalance", methods=["POST"])
def api_rebalance():
    from scipy.optimize import minimize as sp_minimize

    body = request.get_json(force=True)
    tickers = body.get("tickers", [])
    current_portfolio = body.get("portfolio", {})
    risk_free_rate = body.get("risk_free_rate", 0.10)

    market_data = _load_json(os.path.join(DATA_DIR, "market_data.json"))
    if not market_data:
        market_data = EXAMPLE_MARKET_DATA

    # Build returns matrix
    returns_dict = {}
    valid_tickers = []
    for t in tickers:
        if t not in market_data["assets"]:
            continue
        closes = np.array(market_data["assets"][t]["history"]["closes"], dtype=float)
        if len(closes) < 3:
            continue
        rets = np.diff(closes) / closes[:-1]
        returns_dict[t] = rets
        valid_tickers.append(t)

    if len(valid_tickers) < 2:
        return jsonify({"error": "Necessário pelo menos 2 ativos com dados históricos"}), 400

    min_len = min(len(r) for r in returns_dict.values())
    returns_matrix = np.array([returns_dict[t][-min_len:] for t in valid_tickers])
    expected_returns = np.mean(returns_matrix, axis=1) * 252
    cov_matrix = np.cov(returns_matrix)
    n = len(valid_tickers)

    def neg_sharpe(w):
        ret = float(np.sum(expected_returns * w))
        vol = float(np.sqrt(w @ cov_matrix @ w.T))
        return -(ret - risk_free_rate) / vol if vol > 0 else 0

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    bounds = tuple((0, 1) for _ in range(n))
    x0 = np.array([1 / n] * n)

    res = sp_minimize(neg_sharpe, x0, method="SLSQP", bounds=bounds, constraints=constraints)

    if not res.success:
        return jsonify({"error": f"Otimização não convergiu: {res.message}"}), 500

    optimal_w = res.x
    opt_ret = float(np.sum(expected_returns * optimal_w))
    opt_vol = float(np.sqrt(optimal_w @ cov_matrix @ optimal_w.T))
    opt_sharpe = (opt_ret - risk_free_rate) / opt_vol if opt_vol > 0 else 0

    weights = {t: round(float(w) * 100, 2) for t, w in zip(valid_tickers, optimal_w)}

    # Rebalancing suggestions
    suggestions = []
    if current_portfolio:
        total_value = sum(
            current_portfolio.get(t, 0) * market_data["assets"][t]["last_price"]
            for t in valid_tickers
            if t in market_data["assets"]
        )
        for t in valid_tickers:
            price = market_data["assets"][t]["last_price"]
            cur_qty = current_portfolio.get(t, 0)
            cur_val = cur_qty * price
            cur_pct = (cur_val / total_value * 100) if total_value > 0 else 0
            tgt_pct = weights[t]
            tgt_val = (tgt_pct / 100) * total_value
            tgt_qty = int(tgt_val / price) if price > 0 else 0
            diff = tgt_qty - cur_qty
            if abs(diff) > 0:
                suggestions.append(
                    {
                        "ticker": t,
                        "name": market_data["assets"][t]["name"],
                        "action": "COMPRAR" if diff > 0 else "VENDER",
                        "quantity": abs(diff),
                        "current_allocation": round(cur_pct, 2),
                        "target_allocation": tgt_pct,
                        "price": round(price, 2),
                        "total_value": round(abs(diff) * price, 2),
                    }
                )

    result = {
        "timestamp": datetime.now().isoformat(),
        "optimal_allocation": {
            "tickers": valid_tickers,
            "weights": weights,
            "expected_return": round(opt_ret * 100, 2),
            "volatility": round(opt_vol * 100, 2),
            "sharpe_ratio": round(opt_sharpe, 4),
            "risk_free_rate": round(risk_free_rate * 100, 2),
        },
        "rebalancing_suggestions": suggestions,
    }
    _save_json(os.path.join(DATA_DIR, "rebalancing_recommendation.json"), result)
    return jsonify(result)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  B3 Rebalanceamento & IA — Servidor Web")
    print("  Acesse: http://localhost:5000")
    print("=" * 60 + "\n")
    app.run(debug=True, host="0.0.0.0", port=5000)
