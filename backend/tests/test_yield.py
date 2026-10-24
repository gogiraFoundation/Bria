"""Nameplate yield and finance golden tests."""
from services.selection.yield_model import (
    DataQuality,
    annualise,
    data_quality,
    finance,
    solar_ac_kw,
    wind_ac_kw,
)


def test_solar_nameplate_at_stc_returns_1000_kw():
    power = solar_ac_kw(
        1.0,
        1000.0,
        system_loss=0.0,
        inverter_efficiency=1.0,
        temp_air_c=25.0,
        noct=45.0,
        temp_coeff=0.0,
    )
    assert abs(power - 1000.0) < 1e-6


def test_solar_zero_poa_returns_zero():
    assert solar_ac_kw(1.0, 0.0) == 0.0


def test_annual_energy_from_constant_200_w_m2_year():
    """
    200 W/m² constant POA, 1 MW, zero losses, no temp derate:
    CF = 0.2 → 1 MW * 8760 * 0.2 = 1752 MWh.
    """
    hourly = [
        solar_ac_kw(
            1.0,
            200.0,
            system_loss=0.0,
            inverter_efficiency=1.0,
            temp_coeff=0.0,
        )
        for _ in range(8760)
    ]
    result = annualise(hourly, 8760.0)
    assert abs(result.annual_mwh - 1752.0) < 1.0
    # Must not be the old buggy ~14.6 MWh
    assert result.annual_mwh > 100.0


def test_revenue_is_mwh_times_price():
    fin = finance(10.0, 1_000_000.0, 50.0, discount_rate=0.08, lifetime_years=20)
    assert abs(fin.annual_revenue_usd - 500.0) < 1e-6


def test_short_sample_cannot_be_high_quality():
    q = data_quality(
        100.0,
        source="database",
        has_ghi=True,
        has_wind=False,
    )
    assert q == DataQuality.LOW


def test_openweather_fallback_is_low():
    q = data_quality(
        168.0,
        source="openweather_api",
        has_ghi=True,
        has_wind=True,
    )
    assert q == DataQuality.LOW


def test_full_year_is_high():
    q = data_quality(
        8760.0,
        gap_fraction=0.01,
        source="database",
        has_ghi=True,
        has_wind=True,
    )
    assert q == DataQuality.HIGH


def test_wind_below_cut_in_is_zero():
    assert wind_ac_kw(1.0, 2.0, cut_in_speed=3.0, hub_height_m=10.0) == 0.0


def test_wind_is_deterministic():
    a = wind_ac_kw(1.0, 8.0, hub_height_m=80.0, wake_loss=0.0)
    b = wind_ac_kw(1.0, 8.0, hub_height_m=80.0, wake_loss=0.0)
    assert a == b
    assert a > 0


def test_insufficient_without_resource():
    q = data_quality(1000.0, has_ghi=False, has_wind=False)
    assert q == DataQuality.INSUFFICIENT
