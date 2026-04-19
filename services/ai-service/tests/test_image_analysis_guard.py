from src.routers.chat import _sanitize_uploaded_image_analysis


def test_non_construction_photo_is_rejected_as_materials():
    analysis = {
        "materials_detected": [
            {
                "name": "Laptop (Windows 11)",
                "category": "Electronics",
                "quantity_estimate": "1",
                "urgency": "low",
            }
        ],
        "observations": "The image shows a single laptop on a desk.",
        "recommendations": ["Consider a laptop stand."],
        "confidence": 0.9,
    }

    result = _sanitize_uploaded_image_analysis(
        analysis,
        context="photo of laptop on desk",
        filename="desk.jpg",
    )

    assert result["materials_detected"] == []
    assert result["is_construction_related"] is False
    assert "not appear to show construction materials" in result["observations"].lower()


def test_ungrounded_wood_and_adhesive_guess_is_filtered_out():
    analysis = {
        "materials_detected": [
            {
                "name": "Wood (likely Pine or similar)",
                "category": "Timber",
                "quantity_estimate": "1",
                "urgency": "low",
            },
            {
                "name": "Construction Adhesive",
                "category": "Adhesives",
                "quantity_estimate": "1",
                "urgency": "medium",
            },
        ],
        "observations": "It is unclear what dimensions are being used and the image only loosely suggests joining operations.",
        "recommendations": ["Verify the actual material before ordering."],
        "confidence": 0.8,
    }

    result = _sanitize_uploaded_image_analysis(
        analysis,
        context="photo of a lemonade bottle on a desk",
        filename="lemonade.jpg",
    )

    assert result["materials_detected"] == []
    assert result["is_construction_related"] is False
