from overpass import area_filter


def test_area_filter_always_restricts_to_administrative_boundary():
    clause = area_filter("Bilbao")
    assert '["name"="Bilbao"]' in clause
    assert '["boundary"="administrative"]' in clause
    assert "admin_level" not in clause


def test_area_filter_adds_admin_level_when_given():
    clause = area_filter("Bilbao", admin_level="8")
    assert '["admin_level"="8"]' in clause
