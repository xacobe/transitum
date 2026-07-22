import pytest

from seed_line_colors import contrasting_text_color, _hash_string, seed_color_for, LINE_PALETTE


# Same cases as frontend/src/services/color.test.ts's contrastingTextColor
# suite - this is an explicit cross-language contract (see this module's
# own docstring), so the two should never drift.
@pytest.mark.parametrize(
    "bg_hex,expected",
    [
        ("#ffffff", "#000000"),
        ("#000000", "#ffffff"),
        ("#ffff00", "#000000"),  # vivid yellow
        ("#e0e0e0", "#000000"),  # light grey
        ("#0060a8", "#ffffff"),  # Vitrasa blue
        ("#77298f", "#ffffff"),  # Vitrasa purple
        ("#ed4713", "#ffffff"),  # orange - passes WCAG AA against black but reads low-contrast
        ("#009900", "#ffffff"),  # green - same
    ],
)
def test_contrasting_text_color_matches_frontend(bg_hex, expected):
    assert contrasting_text_color(bg_hex) == expected


def test_hash_string_is_deterministic_and_non_negative():
    assert _hash_string("23") == _hash_string("23")
    assert _hash_string("23") >= 0
    assert _hash_string("A") != _hash_string("B")


def test_seed_color_for_is_deterministic_for_the_same_line():
    a = seed_color_for("23", None, has_multiple_agencies=False)
    b = seed_color_for("23", None, has_multiple_agencies=False)
    assert a == b
    assert a in LINE_PALETTE


def test_seed_color_for_ignores_agency_id_for_single_agency_cities():
    with_agency = seed_color_for("23", "BILBOBUS", has_multiple_agencies=False)
    without_agency = seed_color_for("23", None, has_multiple_agencies=False)
    assert with_agency == without_agency


def test_seed_color_for_incorporates_agency_id_for_multi_agency_cities():
    # Matches colorFor()'s key construction directly: `${agencyId}::${shortName}`,
    # uppercased, indexed into LINE_PALETTE - verified by hand here rather
    # than assuming two different agency ids can't collide on the same index.
    expected = LINE_PALETTE[_hash_string("AGENCY_A::23".upper()) % len(LINE_PALETTE)]
    assert seed_color_for("23", "AGENCY_A", has_multiple_agencies=True) == expected
