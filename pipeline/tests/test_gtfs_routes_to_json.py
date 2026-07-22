from gtfs_routes_to_json import (
    gtfs_mode,
    normalize_hex_color,
    natural_sort_key,
    to_seconds,
    compute_frequency_periods,
)


def test_gtfs_mode_maps_known_route_types():
    assert gtfs_mode("0") == "tram"
    assert gtfs_mode("1") == "metro"
    assert gtfs_mode("3") == "bus"
    assert gtfs_mode("11") == "trolleybus"
    assert gtfs_mode("12") == "monorail"


def test_gtfs_mode_falls_back_to_bus_for_unknown_or_missing():
    assert gtfs_mode("999") == "bus"
    assert gtfs_mode(None) == "bus"
    assert gtfs_mode("") == "bus"


def test_normalize_hex_color_accepts_six_hex_digits_with_or_without_hash():
    assert normalize_hex_color("0060A8") == "#0060a8"
    assert normalize_hex_color("#0060A8") == "#0060a8"


def test_normalize_hex_color_returns_none_for_missing_or_malformed():
    assert normalize_hex_color(None) is None
    assert normalize_hex_color("") is None
    assert normalize_hex_color("GGGGGG") is None
    assert normalize_hex_color("ABC") is None


def test_natural_sort_key_orders_numeric_prefixes_numerically():
    lines = ["12", "2B", "4", "10"]
    assert sorted(lines, key=natural_sort_key) == ["2B", "4", "10", "12"]


def test_natural_sort_key_puts_non_numeric_names_last():
    assert natural_sort_key("Express")[0] == float("inf")
    assert natural_sort_key("2B")[0] < natural_sort_key("Express")[0]


def test_to_seconds():
    assert to_seconds("00:00:00") == 0
    assert to_seconds("01:02:03") == 3723


PERIODS = [
    {"start": "05:30:00", "end": "12:00:00", "reliability": "medium"},
    {"start": "12:00:00", "end": "20:00:00", "reliability": "high"},
]


def test_compute_frequency_periods_uses_frequencies_txt_headway_directly():
    direction_trips = [{"trip_id": "t1"}]
    frequencies_by_trip = {
        "t1": [{"start_time": "12:00:00", "end_time": "20:00:00", "headway_secs": "600"}],
    }
    periods, has_fixed_schedule = compute_frequency_periods(
        direction_trips, {}, frequencies_by_trip, PERIODS,
    )
    assert has_fixed_schedule is False
    assert periods == [{"start": "12:00:00", "end": "20:00:00", "headwaySeconds": 600, "reliability": "high"}]


def test_compute_frequency_periods_computes_median_gap_for_schedule_based_trips():
    # Three trips departing 08:00, 08:10, 08:20 from this direction's first
    # stop - a 10-minute (600s) median gap in the 05:30-12:00 band.
    direction_trips = [{"trip_id": "a"}, {"trip_id": "b"}, {"trip_id": "c"}]
    stop_times_by_trip = {
        "a": [{"stop_sequence": "1", "departure_time": "08:00:00"}],
        "b": [{"stop_sequence": "1", "departure_time": "08:10:00"}],
        "c": [{"stop_sequence": "1", "departure_time": "08:20:00"}],
    }
    periods, has_fixed_schedule = compute_frequency_periods(
        direction_trips, stop_times_by_trip, {}, PERIODS,
    )
    assert has_fixed_schedule is True
    assert periods == [{"start": "05:30:00", "end": "12:00:00", "headwaySeconds": 600, "reliability": "medium"}]


def test_compute_frequency_periods_skips_bands_with_fewer_than_two_departures():
    direction_trips = [{"trip_id": "a"}]
    stop_times_by_trip = {"a": [{"stop_sequence": "1", "departure_time": "08:00:00"}]}
    periods, has_fixed_schedule = compute_frequency_periods(
        direction_trips, stop_times_by_trip, {}, PERIODS,
    )
    assert has_fixed_schedule is True
    assert periods == []
