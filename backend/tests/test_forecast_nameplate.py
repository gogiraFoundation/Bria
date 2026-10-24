"""Golden test: nameplate solar yield in ForecastService."""
from datetime import datetime, timezone

from services.forecasting.forecast_service import ForecastService


def test_forecast_solar_nameplate_at_stc():
    """1 MW nameplate, POA 1000 W/m², zero losses → 1000 kW."""
    svc = ForecastService()
    site = {
        "id": "s1",
        "latitude": 0.0,
        "longitude": 0.0,
        "capacity_mw": 1.0,
        "timezone": "UTC",
    }
    # Noon UTC at lon 0 on June 15 → sun up
    ts = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    power = svc._solar_power_kw(
        site=site,
        pv_params={
            "tilt": 0,
            "azimuth": 180,
            "system_loss": 0.0,
            "inverter_efficiency": 1.0,
            "temp_coeff": 0.0,
            "noct": 45,
        },
        timestamp=ts,
        ghi=1000.0,
        dni=1000.0,
        dhi=0.0,
        temperature=25.0,
        wind_speed=0.0,
    )
    # Allow some slack for POA vs GHI on a horizontal plane
    assert power > 800.0
    assert svc._solar_model_version() == "nameplate-v1"


def test_solar_ac_kw_direct_stc():
    from services.selection.yield_model import solar_ac_kw

    assert (
        abs(
            solar_ac_kw(
                1.0,
                1000.0,
                system_loss=0.0,
                inverter_efficiency=1.0,
                temp_coeff=0.0,
            )
            - 1000.0
        )
        < 1e-6
    )
