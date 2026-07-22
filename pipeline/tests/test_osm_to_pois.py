from osm_to_pois import assign_tier_and_type


def test_tier1_amenity():
    assert assign_tier_and_type({"amenity": "hospital"}) == (1, "hospital")


def test_tier1_place():
    assert assign_tier_and_type({"place": "city"}) == (1, "neighbourhood")


def test_tier2_amenity():
    assert assign_tier_and_type({"amenity": "bank"}) == (2, "bank")


def test_tier2_tourism():
    assert assign_tier_and_type({"tourism": "hotel"}) == (2, "hotel")


def test_tier2_leisure():
    assert assign_tier_and_type({"leisure": "park"}) == (2, "park")


def test_tier2_government_falls_back_to_office():
    assert assign_tier_and_type({"government": "ministry"}) == (2, "office")


def test_tier3_amenity():
    assert assign_tier_and_type({"amenity": "restaurant"}) == (3, "food")


def test_tier3_shop_key_presence_not_value():
    assert assign_tier_and_type({"shop": "bakery"}) == (3, "shop")


def test_tier3_office_key_presence_not_value():
    assert assign_tier_and_type({"office": "insurance"}) == (3, "office")


def test_higher_tier_wins_when_multiple_tags_present():
    # amenity=hospital (T1) should win over leisure=park (T2) on the same element.
    assert assign_tier_and_type({"amenity": "hospital", "leisure": "park"}) == (1, "hospital")


def test_unmatched_tags_return_none():
    assert assign_tier_and_type({"building": "yes"}) is None


def test_empty_tags_return_none():
    assert assign_tier_and_type({}) is None
