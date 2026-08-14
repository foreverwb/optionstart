def compact_ticker(code: str) -> str:
    return code.split(".", 1)[1] if "." in code else code


def _search_rank(ticker: str, name: str, query: str) -> tuple[int, int, str]:
    ticker_upper = ticker.upper()
    name_upper = name.upper()
    if ticker_upper == query:
        priority = 0
    elif name_upper == query:
        priority = 1
    elif ticker_upper.startswith(query):
        priority = 2
    elif name_upper.startswith(query):
        priority = 3
    elif query in ticker_upper:
        priority = 4
    else:
        priority = 5
    return priority, len(ticker), ticker_upper


def rank_search_rows(
    rows: list[dict[str, object]],
    query: str,
    limit: int = 20,
) -> list[dict[str, object]]:
    q = query.strip().upper()
    if not q:
        return []

    unique_matches: dict[str, dict[str, object]] = {}
    for row in rows:
        ticker = compact_ticker(str(row.get("code", ""))).strip()
        name = str(row.get("name", "")).strip()
        if not ticker or (q not in ticker.upper() and q not in name.upper()):
            continue
        unique_matches.setdefault(
            ticker.upper(),
            {"ticker": ticker, "name": name, "market": "US"},
        )

    matches = list(unique_matches.values())
    matches.sort(key=lambda row: _search_rank(str(row["ticker"]), str(row["name"]), q))
    return matches[:limit]
