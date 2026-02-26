import json
import math
from scripts.data_fetcher import sanitize_data

test_data = {
    "ticker": "TEST3.SA",
    "stats": {
        "volatility": float('nan'),
        "avg_price": 10.5,
        "max_price": float('inf')
    },
    "history": [1.0, 2.0, float('nan')]
}

clean = sanitize_data(test_data)
print(json.dumps(clean))
