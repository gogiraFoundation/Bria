"""Build and persist-shaped recommendation run payloads."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from services.selection.options import (
    CapexInputs,
    Constraints,
    build_options,
    options_as_dicts,
)
from services.selection.vendors import empty_vendor_message, match_vendors
from services.selection.yield_model import MODEL_VERSION, data_quality


def synthesise_hourly_kw(annual_kwh: float, peak_kw: float) -> List[float]:
    """Flat-top daytime shape: 12 hours at peak scaled to annual energy."""
    if annual_kwh <= 0 or peak_kw <= 0:
        return [0.0] * 8760
    # Average kW from annual
    avg_kw = annual_kwh / 8760.0
    if peak_kw < avg_kw:
        peak_kw = avg_kw
    # Use peak for 12 hours/day, scale so sum ≈ annual_kwh
    hours = []
    for h in range(8760):
        hour_of_day = h % 24
        hours.append(peak_kw if 7 <= hour_of_day < 19 else 0.0)
    total = sum(hours)
    if total <= 0:
        return [avg_kw] * 8760
    scale = annual_kwh / total
    return [v * scale for v in hours]


def validate_load(annual_kwh: float, peak_kw: float) -> Optional[str]:
    if annual_kwh is None or annual_kwh <= 0:
        return "annual_kwh must be greater than zero"
    if peak_kw is None or peak_kw <= 0:
        return "peak_kw must be greater than zero"
    avg = annual_kwh / 8760.0
    if peak_kw < avg:
        return "peak_kw is below the average load implied by annual_kwh"
    return None


def build_run_result(
    *,
    weather_rows: Sequence[Dict[str, Any]],
    latitude: float,
    longitude: float,
    country_code: Optional[str],
    annual_kwh: float,
    peak_kw: float,
    critical_fraction: float = 0.0,
    backup_hours: float = 0.0,
    grid_mode: str = "firm_grid",
    objective: str = "min_cost_to_serve",
    roof_only: bool = False,
    max_area_m2: Optional[float] = None,
    budget_capex: Optional[float] = None,
    max_turbine_height_m: Optional[float] = None,
    energy_price_per_mwh: float = 50.0,
    solar_capex_per_mw: Optional[float] = 1_000_000.0,
    wind_capex_per_mw: Optional[float] = 1_500_000.0,
    battery_capex_per_kwh: Optional[float] = None,
    weather_source: str = "database",
    vendor_products: Optional[Sequence[Dict[str, Any]]] = None,
    hourly_kw: Optional[List[float]] = None,
) -> Dict[str, Any]:
    err = validate_load(annual_kwh, peak_kw)
    if err:
        raise ValueError(err)

    shape_assumed = False
    if hourly_kw is not None:
        if len(hourly_kw) != 8760:
            raise ValueError("hourly_kw must contain exactly 8760 values")
    else:
        hourly_kw = synthesise_hourly_kw(annual_kwh, peak_kw)
        shape_assumed = True

    sample_hours = float(len(weather_rows))
    has_ghi = any(r.get("ghi") is not None for r in weather_rows)
    has_wind = any(r.get("wind_speed") is not None for r in weather_rows)
    quality = data_quality(
        sample_hours,
        source=weather_source,
        has_ghi=has_ghi,
        has_wind=has_wind,
    )

    constraints = Constraints(
        roof_only=roof_only,
        max_area_m2=max_area_m2,
        budget_capex=budget_capex,
        max_turbine_height_m=max_turbine_height_m,
        grid_mode=grid_mode,
        backup_hours=backup_hours,
        critical_fraction=critical_fraction,
        peak_kw=peak_kw,
        annual_kwh=annual_kwh,
    )
    caps = CapexInputs(
        pv_fixed=solar_capex_per_mw,
        pv_tracker=solar_capex_per_mw * 1.1 if solar_capex_per_mw else None,
        pv_rooftop=solar_capex_per_mw * 1.2 if solar_capex_per_mw else None,
        wind_onshore=wind_capex_per_mw,
        wind_small=wind_capex_per_mw,
        battery_per_kwh=battery_capex_per_kwh,
        hybrid=None,
        energy_price_per_mwh=energy_price_per_mwh,
    )

    options = build_options(
        weather_rows, constraints, caps, objective=objective
    )
    option_dicts = options_as_dicts(options)

    vendor_matches: List[Dict[str, Any]] = []
    vendor_message = None
    if vendor_products:
        vendor_matches = match_vendors(
            option_dicts, list(vendor_products), country_code=country_code
        )
    if not vendor_matches:
        top = next((o for o in option_dicts if o["eligible"]), None)
        cls = top["technology_class"] if top else "requested class"
        vendor_message = empty_vendor_message(country_code, cls)

    return {
        "latitude": latitude,
        "longitude": longitude,
        "country_code": country_code,
        "objective": objective,
        "data_quality": quality.value,
        "model_version": MODEL_VERSION,
        "load": {
            "annual_kwh": annual_kwh,
            "peak_kw": peak_kw,
            "critical_fraction": critical_fraction,
            "backup_hours": backup_hours,
            "grid_mode": grid_mode,
            "hourly_shape_assumed": shape_assumed,
        },
        "options": option_dicts,
        "vendors": vendor_matches,
        "vendor_message": vendor_message,
        "assumptions": {
            "energy_price_per_mwh": energy_price_per_mwh,
            "solar_capex_per_mw": solar_capex_per_mw,
            "wind_capex_per_mw": wind_capex_per_mw,
            "battery_capex_per_kwh": battery_capex_per_kwh,
            "weather_source": weather_source,
            "sample_hours": sample_hours,
        },
    }
