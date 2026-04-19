from src.llm.langchain_client import _extract_json
from src.prompts import task_recommender as tr


def test_extract_json_wraps_root_arrays_for_structured_callers():
    result = _extract_json('[{"name": "Drywall screw", "quantity": 1}]')
    assert result == {"results": [{"name": "Drywall screw", "quantity": 1}]}


def test_task_recommender_prompt_is_catalog_grounded():
    assert "Only recommend C-materials from the supplied live catalog candidates" in tr.SYSTEM
    assert "Never invent product IDs, SKUs, brands, sizes, or standards" in tr.SYSTEM
