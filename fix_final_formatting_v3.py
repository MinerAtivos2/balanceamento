import re

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Rule 1: (...) .toFixed(n) -> this.formatNumber(..., n)
    content = re.sub(r'\(([^)]+)\)\.toFixed\((\d+)\)', r'this.formatNumber(\1, \2)', content)

    # Rule 2: var.toFixed(n) -> this.formatNumber(var, n)
    # Simple property access up to 2 levels (e.g. data.last_close, ctx.raw)
    content = re.sub(r'([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\.toFixed\((\d+)\)', r'this.formatNumber(\1, \2)', content)
    content = re.sub(r'([a-zA-Z0-9_]+)\.toFixed\((\d+)\)', r'this.formatNumber(\1, \2)', content)

    with open(filepath, 'w') as f:
        f.write(content)

fix_file('docs/portfolio/app.js')
