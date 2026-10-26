import json
from pathlib import Path

from app.modules.geo.rules import haversine_m, verify


def test_haversine_zero_and_symmetry():
    assert haversine_m(0, 0, 0, 0) == 0
    a = haversine_m(0.3476, 32.6130, 0.3490389, 32.6130)
    b = haversine_m(0.3490389, 32.6130, 0.3476, 32.6130)
    assert abs(a - b) < 0.001


def test_kampala_to_entebbe_distance_is_reasonable():
    distance = haversine_m(0.3476, 32.6130, 0.0510, 32.4637)
    assert 31_000 < distance < 34_000


def test_geo_cases_fixture():
    fixture = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "geo_cases.json"
    cases = json.loads(fixture.read_text())
    snapshot = {"lat": 0.3476, "lng": 32.6130, "radius_m": 150}
    for case in cases:
        verification, distance = verify(
            {"lat": case["lat"], "lng": case["lng"], "accuracy_m": case["accuracy_m"]},
            snapshot,
            {"max_accuracy_m": 100},
        )
        assert verification == case["expect"], case["case"]
        if case["distance_m"] is None:
            assert distance is None
        else:
            assert abs(distance - case["distance_m"]) <= 0.5, case["case"]
