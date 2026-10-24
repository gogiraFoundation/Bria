"""Technology shortlist and vendor matching tests."""
from datetime import date

from services.selection.options import CapexInputs, Constraints, build_options
from services.selection.runs import synthesise_hourly_kw, validate_load, build_run_result
from services.selection.vendors import contact_draft, match_vendors


def _weather(n=100):
    rows = []
    for i in range(n):
        hour = i % 24
        rows.append(
            {
                "ghi": 400.0 if 8 <= hour < 17 else 0.0,
                "wind_speed": 7.0,
                "ambient_temp": 20.0,
            }
        )
    return rows


def test_validate_load_peak_below_average():
    err = validate_load(876000.0, 10.0)  # avg 100 kW
    assert err is not None


def test_synthesise_hourly_length():
    hours = synthesise_hourly_kw(100_000.0, 50.0)
    assert len(hours) == 8760
    assert abs(sum(hours) - 100_000.0) < 1.0


def test_roof_only_excludes_tracker_and_onshore():
    opts = build_options(
        _weather(),
        Constraints(
            roof_only=True,
            annual_kwh=50_000,
            peak_kw=20,
            grid_mode="firm_grid",
        ),
        CapexInputs(pv_fixed=1_000_000, wind_onshore=1_500_000),
    )
    by_cls = {o.technology_class: o for o in opts}
    assert by_cls["pv_tracker"].eligible is False
    assert by_cls["wind_onshore"].eligible is False
    assert by_cls["pv_rooftop"].eligible is True or by_cls["pv_fixed"].eligible is True


def test_hybrid_fraction_stable():
    weather = _weather(200)
    a = build_options(
        weather,
        Constraints(annual_kwh=200_000, peak_kw=80),
        CapexInputs(pv_fixed=1_000_000, wind_onshore=1_500_000),
        objective="min_cost_to_serve",
    )
    b = build_options(
        weather,
        Constraints(annual_kwh=200_000, peak_kw=80),
        CapexInputs(pv_fixed=1_000_000, wind_onshore=1_500_000),
        objective="min_cost_to_serve",
    )
    ha = next(o for o in a if o.technology_class == "hybrid")
    hb = next(o for o in b if o.technology_class == "hybrid")
    assert ha.solar_fraction == hb.solar_fraction


def test_vendor_match_by_country_and_class():
    options = [
        {
            "technology_class": "pv_rooftop",
            "eligible": True,
            "capacity_mw": 0.5,
            "rank": 1,
        },
        {
            "technology_class": "wind_onshore",
            "eligible": True,
            "capacity_mw": 10.0,
            "rank": 2,
        },
    ]
    products = [
        {
            "vendor_id": "v1",
            "product_id": "p1",
            "legal_name": "Example Solar Ltd",
            "website_url": "https://example.com",
            "contact_url": "https://example.com/contact",
            "countries": ["GB"],
            "last_verified_on": date.today(),
            "active": True,
            "technology_class": "pv_rooftop",
            "min_capacity_mw": 0.1,
            "max_capacity_mw": 2.0,
        }
    ]
    gb = match_vendors(options, products, country_code="GB")
    us = match_vendors(options, products, country_code="US")
    assert len(gb) == 1
    assert gb[0]["technology_class"] == "pv_rooftop"
    assert us == []


def test_contact_draft_shape():
    draft = contact_draft(
        legal_name="Example Solar Ltd",
        technology_class="pv_rooftop",
        capacity_mw=0.5,
        contact_url="https://example.com/contact",
        site_or_location="GB (51.5, -0.1)",
    )
    assert "subject" in draft and "body" in draft
    assert "Example Solar Ltd" in draft["body"]


def test_build_run_result_includes_options():
    result = build_run_result(
        weather_rows=_weather(120),
        latitude=51.5,
        longitude=-0.1,
        country_code="GB",
        annual_kwh=80_000,
        peak_kw=40,
        solar_capex_per_mw=1_000_000,
        wind_capex_per_mw=1_500_000,
    )
    assert result["model_version"] == "nameplate-v1"
    assert len(result["options"]) >= 1
    assert result["data_quality"] in ("low", "medium", "high", "insufficient")
