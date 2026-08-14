import unittest

from services.history_service import HistoryService


class HistoryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = HistoryService()

    def test_options_use_daily_history_while_stocks_use_timeframe_interval(self) -> None:
        self.assertEqual(self.service._interval_for("US.BE260911C220000", "1w"), "K_DAY")
        self.assertEqual(self.service._interval_for("US.BE", "1w"), "K_30M")
        self.assertEqual(self.service._interval_for("US.AAPL", "1d"), "K_5M")

    def test_history_rows_are_normalized_and_trimmed_to_latest_session(self) -> None:
        rows = [
            {"time_key": "2026-08-06 09:30:00", "open": 10, "high": 12, "low": 9, "close": 11, "volume": 5},
            {"time_key": "2026-08-07 09:30:00", "open": 12, "high": 11, "low": 13, "close": 12.5, "volume": 8},
            {"time_key": "2026-08-07 10:00:00", "open": 12.5, "high": 14, "low": 12, "close": 13, "volume": 9},
        ]

        bars = self.service._bars_from_rows(rows, trading_days=1)

        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[0].timestamp.isoformat(), "2026-08-07T13:30:00+00:00")
        self.assertEqual(bars[0].high, 13)
        self.assertEqual(bars[0].low, 11)


if __name__ == "__main__":
    unittest.main()
