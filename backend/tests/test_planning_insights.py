"""Unit tests for factual Planning-tab scheduling and insights helpers."""

from services.forecasting.planning_insights import (
    build_forecast_insights,
    build_scheduling_analysis,
    coefficient_of_variation,
    daytime_indices,
    operating_floor_kw,
)


def _solar_day_curve():
    """24h synthetic solar: night zeros, midday peak ~700 kW on 10 MW site."""
    powers = []
    timestamps = []
    for h in range(24):
        timestamps.append(f"2026-10-24T{h:02d}:00:00Z")
        if h < 7 or h >= 18:
            powers.append(0.0)
        elif h == 7:
            powers.append(8.4)
        elif h == 8:
            powers.append(80.0)
        elif h == 9:
            powers.append(275.0)
        elif h == 10:
            powers.append(555.0)
        elif h == 11:
            powers.append(727.0)
        elif h == 12:
            powers.append(734.0)
        elif h == 13:
            powers.append(693.0)
        elif h == 14:
            powers.append(568.0)
        elif h == 15:
            powers.append(428.0)
        elif h == 16:
            powers.append(156.0)
        elif h == 17:
            powers.append(65.0)
        else:
            powers.append(0.0)
    return powers, timestamps


def test_operating_floor():
    assert operating_floor_kw(10000) == 500.0
    assert operating_floor_kw(10) == 1.0


def test_daytime_indices_exclude_night():
    powers, timestamps = _solar_day_curve()
    idxs = daytime_indices(powers, timestamps, 10000.0, "solar")
    # Floor is 500 kW → hours 10–14 only in this curve
    assert idxs == [10, 11, 12, 13, 14]
    assert all(powers[i] >= 500 for i in idxs)


def test_cv_is_std_over_mean_not_range():
    # Old bug used (max-min)/mean; real CV for [100,100,100] is 0
    assert coefficient_of_variation([100, 100, 100]) == 0.0
    cv = coefficient_of_variation([100, 200, 300])
    assert 40 < cv < 50


def test_scheduling_excludes_night_from_maintenance():
    powers, timestamps = _solar_day_curve()
    result = build_scheduling_analysis(powers, timestamps, 10000.0, "solar", 24)
    assert result["peak_periods"]
    assert result["peak_periods"][0]["power_kw"] == 734.0
    # Capacity factor vs nameplate, not vs peak
    assert result["peak_periods"][0]["capacity_factor"] == 7.3
    for window in result["maintenance_windows"]:
        assert window["power_kw"] >= 500.0  # never overnight zero
    titles = [r["title"] for r in result["recommendations"]]
    assert any("Peak" in t for t in titles)
    # Must not claim 150%+ CV from night-to-day range
    for rec in result["recommendations"]:
        if rec["type"] == "variability":
            assert "152" not in rec["description"]


def test_insights_ignore_sunrise_ramp_as_anomaly():
    powers, timestamps = _solar_day_curve()
    built = build_forecast_insights(powers, timestamps, 10000.0, "solar")
    # 8.4 → 275 is sunrise-like and below floor on at least one side
    for a in built["anomalies"]:
        msg = a["message"].lower()
        assert "sunrise" in msg or a["previous_power_kw"] >= 500
        # Never flag night→morning 3181% style
        assert abs(a["change_percentage"]) < 3000
    assert built["summary"]["total_insights"] >= 1
    diurnal = [i for i in built["insights"] if i["type"] == "diurnal_pattern"]
    assert diurnal
    assert "expected for solar" in diurnal[0]["message"].lower()


def test_insights_no_false_high_cv_from_diurnal_range():
    powers, timestamps = _solar_day_curve()
    built = build_forecast_insights(powers, timestamps, 10000.0, "solar")
    # Daytime-only CV on operating hours should not invent 150%+ from min=0 max=734
    for insight in built["insights"]:
        if insight["type"] == "high_variability":
            assert "152" not in insight["message"]
