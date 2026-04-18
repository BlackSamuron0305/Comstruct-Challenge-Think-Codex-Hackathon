"""Golden tests for the heuristic stub of the C-material classifier.

These guarantee that the two known A-materials from spec §11
(Betonrohr Ø80cm @ 151.68 CHF, Kabelschacht @ 1376 CHF) are NEVER
classified as C even when the LLM is unavailable.
"""
import pytest

from src.services.classification import _stub_classify


@pytest.mark.parametrize("name, price", [
    ("Betonrohr Ø80cm DN800", 151.68),
    ("Kabelschacht Typ B 600x600", 1376.00),
    ("Stahlträger HEB 200", 320.00),
    ("Bewehrungsstahl B500B", 110.0),
])
def test_known_a_materials_never_C_in_stub(name, price):
    out = _stub_classify([{"name": name, "unit_price": price, "currency": "CHF"}])
    assert out["results"][0]["material_class"] in ("A", "B")


@pytest.mark.parametrize("name, price", [
    ("Spax Holzschraube 4x40 Pack", 6.50),
    ("Silikon Sanitär weiss 310ml", 4.20),
    ("Bauhandschuh Gr. L Paar", 1.80),
])
def test_clear_c_materials_classified_C_in_stub(name, price):
    out = _stub_classify([{"name": name, "unit_price": price, "currency": "CHF"}])
    assert out["results"][0]["material_class"] == "C"
