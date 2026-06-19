import re

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Pattern for .toFixed(n) -> this.formatNumber(..., n)
    # Match various patterns observed in grep

    # el.textContent = `${label}: ${sign}${(val * 100).toFixed(2)}%`;
    content = re.sub(r'(\(val \* 100\))\.toFixed\((\d+)\)', r'this.formatNumber(\1, \2)', content)

    # s.portfolio_rentability_real.toFixed(2)
    content = re.sub(r's\.portfolio_rentability_real\.toFixed\((\d+)\)', r'this.formatNumber(s.portfolio_rentability_real, \1)', content)
    content = re.sub(r's\.portfolio_volatility\.toFixed\((\d+)\)', r'this.formatNumber(s.portfolio_volatility, \1)', content)
    content = re.sub(r'\(s\.sharpe_ratio \|\| 0\)\.toFixed\((\d+)\)', r'this.formatNumber(s.sharpe_ratio || 0, \1)', content)

    # rent.toFixed(2)
    content = re.sub(r'rent\.toFixed\((\d+)\)', r'this.formatNumber(rent, \1)', content)

    # avgYield.toFixed(2)
    content = re.sub(r'avgYield\.toFixed\((\d+)\)', r'this.formatNumber(avgYield, \1)', content)

    # item.yield_period.toFixed(2)
    content = re.sub(r'item\.yield_period\.toFixed\((\d+)\)', r'this.formatNumber(item.yield_period, \1)', content)

    # opt.expected_return.toFixed(2)
    content = re.sub(r'opt\.expected_return\.toFixed\((\d+)\)', r'this.formatNumber(opt.expected_return, \1)', content)
    content = re.sub(r'opt\.volatility\.toFixed\((\d+)\)', r'this.formatNumber(opt.volatility, \1)', content)
    content = re.sub(r'opt\.sharpe_ratio\.toFixed\((\d+)\)', r'this.formatNumber(opt.sharpe_ratio, \1)', content)

    # a.current_price.toFixed(2) etc in Barsi
    content = re.sub(r'a\.current_price\.toFixed\((\d+)\)', r'this.formatNumber(a.current_price, \1)', content)
    content = re.sub(r'a\.price_ceiling\.toFixed\((\d+)\)', r'this.formatNumber(a.price_ceiling, \1)', content)
    content = re.sub(r'a\.margin_of_safety\.toFixed\((\d+)\)', r'this.formatNumber(a.margin_of_safety, \1)', content)
    content = re.sub(r'a\.current_yield\.toFixed\((\d+)\)', r'this.formatNumber(a.current_yield, \1)', content)

    with open(filepath, 'w') as f:
        f.write(content)

fix_file('docs/portfolio/app.js')
