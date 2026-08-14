import unittest

from services.search_service import rank_search_rows


def row(ticker: str, name: str) -> dict[str, object]:
    return {"code": f"US.{ticker}", "name": name}


class SearchRankingTests(unittest.TestCase):
    def test_exact_ticker_is_not_lost_after_result_limit(self) -> None:
        rows = [row(f"A{i:02}BE", f"Company BE {i}") for i in range(30)]
        rows.append(row("BE", "Bloom Energy"))

        results = rank_search_rows(rows, "BE")

        self.assertEqual(len(results), 20)
        self.assertEqual(
            results[0],
            {"ticker": "BE", "name": "Bloom Energy", "market": "US"},
        )

    def test_search_results_use_relevance_order(self) -> None:
        rows = [
            row("ADBE", "Adobe"),
            row("BEP", "Brookfield Renewable Partners"),
            row("XYZ", "BE"),
            row("BE", "Bloom Energy"),
            row("BETA", "Beta Technologies"),
        ]

        results = rank_search_rows(rows, " be ")

        self.assertEqual(
            [result["ticker"] for result in results],
            ["BE", "XYZ", "BEP", "BETA", "ADBE"],
        )

    def test_duplicate_stock_and_etf_rows_are_collapsed(self) -> None:
        rows = [row("BE", "Bloom Energy"), row("BE", "Bloom Energy Corp")]

        results = rank_search_rows(rows, "be")

        self.assertEqual(
            results,
            [{"ticker": "BE", "name": "Bloom Energy", "market": "US"}],
        )


if __name__ == "__main__":
    unittest.main()
