"""
Site-level technology recommendation using nameplate yield.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from services.selection.yield_model import (
    HOURS_PER_YEAR,
    MODEL_VERSION,
    DataQuality,
    air_density_kg_m3,
    annualise,
    data_quality,
    finance,
    plane_of_array_w_m2,
    solar_ac_kw,
    wind_ac_kw,
)


def _parse_params(raw: Any) -> Dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _nested(params: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    cur: Any = params
    for key in keys:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


def _float(value: Any, default: float) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _optional_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _resource_class_solar(avg_ghi: float) -> str:
    if avg_ghi > 200:
        return "Excellent"
    if avg_ghi > 150:
        return "Good"
    if avg_ghi > 100:
        return "Fair"
    return "Poor"


def _resource_class_wind(avg_ws: float) -> str:
    if avg_ws > 7.5:
        return "Excellent"
    if avg_ws > 6.5:
        return "Good"
    if avg_ws > 5.5:
        return "Fair"
    return "Poor"


def _clamp_confidence(desired: str, quality: DataQuality) -> str:
    order = ["low", "medium", "high"]
    quality_map = {
        DataQuality.INSUFFICIENT: "low",
        DataQuality.LOW: "low",
        DataQuality.MEDIUM: "medium",
        DataQuality.HIGH: "high",
    }
    max_allowed = quality_map[quality]
    return order[min(order.index(desired), order.index(max_allowed))]


def _finance_dict(fin) -> Dict[str, Any]:
    return {
        "capex_usd": fin.capex_usd,
        "annual_revenue_usd": fin.annual_revenue_usd,
        "lcoe_usd_per_mwh": fin.lcoe_usd_per_mwh
        if fin.lcoe_usd_per_mwh is not None
        else float("inf"),
        "payback_years": fin.payback_years
        if fin.payback_years is not None
        else float("inf"),
        "npv_20yr_usd": fin.npv_usd,
    }


def recommend_for_site(
    site: Dict[str, Any],
    weather_rows: Sequence[Dict[str, Any]],
    *,
    energy_price_per_mwh: Optional[float] = None,
    solar_capex_per_mw: Optional[float] = None,
    wind_capex_per_mw: Optional[float] = None,
    discount_rate: float = 0.08,
    lifetime_years: int = 20,
    weather_source: str = "database",
    is_tmy: bool = False,
    gap_fraction: float = 0.0,
) -> Dict[str, Any]:
    """
    Compare solar, wind, and 50/50 hybrid for an existing site nameplate.

    Returns the legacy technology-recommendation JSON shape plus data_quality
    and model_version.
    """
    site_id = str(site.get("id", ""))
    capacity_mw = _float(site.get("capacity_mw"), 0.0)
    latitude = _float(site.get("latitude"), 0.0)
    longitude = _float(site.get("longitude"), 0.0)
    pv_params = _parse_params(site.get("pv_params"))
    turbine_params = _parse_params(site.get("turbine_params"))

    stored_price = _float(
        _nested(pv_params, "financial", "energy_price")
        or _nested(turbine_params, "financial", "energy_price"),
        50.0,
    )
    has_solar_capex = _nested(pv_params, "financial", "capex") is not None
    has_wind_capex = _nested(turbine_params, "financial", "capex") is not None
    stored_solar_capex = _float(
        _nested(pv_params, "financial", "capex"),
        capacity_mw * 1_000_000.0 if capacity_mw else 1_000_000.0,
    )
    stored_wind_capex = _float(
        _nested(turbine_params, "financial", "capex"),
        capacity_mw * 1_500_000.0 if capacity_mw else 1_500_000.0,
    )

    price = (
        float(energy_price_per_mwh)
        if energy_price_per_mwh is not None
        else stored_price
    )
    if solar_capex_per_mw is not None:
        solar_capex_per_mw_eff = float(solar_capex_per_mw)
    elif has_solar_capex and capacity_mw > 0:
        solar_capex_per_mw_eff = stored_solar_capex / capacity_mw
    else:
        solar_capex_per_mw_eff = 1_000_000.0

    if wind_capex_per_mw is not None:
        wind_capex_per_mw_eff = float(wind_capex_per_mw)
    elif has_wind_capex and capacity_mw > 0:
        wind_capex_per_mw_eff = stored_wind_capex / capacity_mw
    else:
        wind_capex_per_mw_eff = 1_500_000.0

    tilt = _float(pv_params.get("tilt"), 30.0)
    azimuth = _float(pv_params.get("azimuth"), 180.0)
    system_loss = _float(pv_params.get("system_loss"), 0.14)
    inverter_eff = _float(pv_params.get("inverter_efficiency"), 0.96)
    noct = _float(pv_params.get("noct"), 45.0)
    temp_coeff = _float(pv_params.get("temp_coeff"), -0.004)

    hub_height = _float(turbine_params.get("hub_height"), 80.0)
    cut_in = _float(turbine_params.get("cut_in_speed"), 3.0)
    rated_speed = _float(turbine_params.get("rated_speed"), 12.0)
    cut_out = _float(turbine_params.get("cut_out_speed"), 25.0)
    wake_loss = _float(turbine_params.get("wake_loss"), 0.0)

    insufficient = {
        "site_id": site_id,
        "error": "Insufficient weather data for analysis",
        "message": "Need at least 24 hours of historical weather data for analysis",
        "recommendations": {
            "recommended_technology": "unknown",
            "confidence": "low",
            "reasoning": [],
        },
        "data_quality": DataQuality.INSUFFICIENT.value,
        "model_version": MODEL_VERSION,
    }

    if not weather_rows:
        return insufficient

    ghi_values: List[float] = []
    wind_values: List[float] = []
    solar_hourly_kwh: List[float] = []
    wind_hourly_kwh: List[float] = []

    for row in weather_rows:
        ghi = _optional_float(row.get("ghi"))
        wind_speed = _optional_float(row.get("wind_speed"))
        temp = row.get("ambient_temp")
        if temp is None:
            temp = row.get("temperature")
        pressure = row.get("air_pressure")
        if pressure is None:
            pressure = row.get("pressure")
        ts = row.get("time") or row.get("timestamp")
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))

        if ghi is not None:
            ghi_values.append(ghi)
            if capacity_mw > 0:
                poa = 0.0
                if ts is not None:
                    poa = plane_of_array_w_m2(
                        ghi,
                        ts,
                        latitude,
                        longitude,
                        tilt=tilt,
                        azimuth=azimuth,
                        dni=_optional_float(row.get("dni")),
                        dhi=_optional_float(row.get("dhi")),
                    )
                # Daytime GHI with failed POA: approximate POA with GHI
                irradiance = poa if poa > 0 else (ghi if ts is None else 0.0)
                if irradiance <= 0 and ghi > 50 and ts is None:
                    irradiance = ghi
                kw = solar_ac_kw(
                    capacity_mw,
                    irradiance,
                    system_loss=system_loss,
                    inverter_efficiency=inverter_eff,
                    temp_air_c=_float(temp, 25.0),
                    noct=noct,
                    temp_coeff=temp_coeff,
                    wind_speed_m_s=_float(wind_speed, 0.0),
                )
                solar_hourly_kwh.append(kw)

        if wind_speed is not None:
            wind_values.append(wind_speed)
            if capacity_mw > 0:
                density = air_density_kg_m3(
                    _float(temp, 15.0) if temp is not None else None,
                    _float(pressure, 1013.25) if pressure is not None else None,
                )
                kw = wind_ac_kw(
                    capacity_mw,
                    wind_speed,
                    hub_height_m=hub_height,
                    cut_in_speed=cut_in,
                    rated_speed=rated_speed,
                    cut_out_speed=cut_out,
                    wake_loss=wake_loss,
                    air_density=density,
                )
                wind_hourly_kwh.append(kw)

    sample_hours = float(len(weather_rows))
    quality = data_quality(
        sample_hours,
        gap_fraction=gap_fraction,
        source=weather_source,
        is_tmy=is_tmy,
        has_ghi=len(ghi_values) > 0,
        has_wind=len(wind_values) > 0,
    )

    if quality == DataQuality.INSUFFICIENT:
        return {
            **insufficient,
            "message": "Need at least 24 hours of usable GHI or wind speed data",
            "data_points_analyzed": len(weather_rows),
        }

    solar_analysis: Dict[str, Any] = {}
    wind_analysis: Dict[str, Any] = {}
    financial_analysis: Dict[str, Any] = {}
    hybrid_analysis: Dict[str, Any] = {}

    if ghi_values and solar_hourly_kwh:
        avg_ghi = sum(ghi_values) / len(ghi_values)
        solar_annual = annualise(solar_hourly_kwh, float(len(solar_hourly_kwh)))
        theoretical_mwh = capacity_mw * HOURS_PER_YEAR if capacity_mw > 0 else 0.0
        cf_pct = (
            (solar_annual.annual_mwh / theoretical_mwh) * 100.0
            if theoretical_mwh > 0
            else 0.0
        )
        solar_analysis = {
            "avg_ghi_w_per_m2": round(avg_ghi, 2),
            "max_ghi_w_per_m2": round(max(ghi_values), 2),
            "min_ghi_w_per_m2": round(min(ghi_values), 2),
            "estimated_capacity_factor_percent": round(cf_pct, 2),
            "annual_energy_gwh": round(solar_annual.annual_mwh / 1000.0, 4),
            "solar_resource_class": _resource_class_solar(avg_ghi),
        }
        financial_analysis["solar"] = _finance_dict(
            finance(
                solar_annual.annual_mwh,
                capacity_mw * solar_capex_per_mw_eff,
                price,
                discount_rate=discount_rate,
                lifetime_years=lifetime_years,
            )
        )

    if wind_values and wind_hourly_kwh:
        avg_ws = sum(wind_values) / len(wind_values)
        wind_annual = annualise(wind_hourly_kwh, float(len(wind_hourly_kwh)))
        theoretical_mwh = capacity_mw * HOURS_PER_YEAR if capacity_mw > 0 else 0.0
        cf_pct = (
            (wind_annual.annual_mwh / theoretical_mwh) * 100.0
            if theoretical_mwh > 0
            else 0.0
        )
        wind_analysis = {
            "avg_wind_speed_m_per_s": round(avg_ws, 2),
            "max_wind_speed_m_per_s": round(max(wind_values), 2),
            "min_wind_speed_m_per_s": round(min(wind_values), 2),
            "estimated_capacity_factor_percent": round(cf_pct, 2),
            "annual_energy_gwh": round(wind_annual.annual_mwh / 1000.0, 4),
            "wind_resource_class": _resource_class_wind(avg_ws),
        }
        financial_analysis["wind"] = _finance_dict(
            finance(
                wind_annual.annual_mwh,
                capacity_mw * wind_capex_per_mw_eff,
                price,
                discount_rate=discount_rate,
                lifetime_years=lifetime_years,
            )
        )

    if solar_analysis and wind_analysis:
        hybrid_mwh = (
            solar_analysis["annual_energy_gwh"] * 1000.0 * 0.5
            + wind_analysis["annual_energy_gwh"] * 1000.0 * 0.5
        )
        hybrid_capex = (
            capacity_mw * 0.5 * solar_capex_per_mw_eff
            + capacity_mw * 0.5 * wind_capex_per_mw_eff
        )
        hybrid_fin = finance(
            hybrid_mwh,
            hybrid_capex,
            price,
            discount_rate=discount_rate,
            lifetime_years=lifetime_years,
        )
        hybrid_analysis = {
            **_finance_dict(hybrid_fin),
            "annual_energy_gwh": round(hybrid_mwh / 1000.0, 4),
        }

    recommendations = _pick_recommendation(
        solar_analysis, wind_analysis, financial_analysis, hybrid_analysis, quality
    )

    return {
        "site_id": site_id,
        "analysis_period_days": round(sample_hours / 24.0, 1),
        "data_points_analyzed": len(weather_rows),
        "solar_analysis": solar_analysis or None,
        "wind_analysis": wind_analysis or None,
        "hybrid_analysis": hybrid_analysis or None,
        "financial_analysis": financial_analysis,
        "recommendations": recommendations,
        "assumptions": {
            "energy_price_per_mwh": price,
            "solar_capex_per_mw": solar_capex_per_mw_eff,
            "wind_capex_per_mw": wind_capex_per_mw_eff,
            "solar_efficiency": None,
            "solar_availability": 1.0 - system_loss,
            "discount_rate": discount_rate,
            "lifetime_years": lifetime_years,
            "system_loss": system_loss,
            "inverter_efficiency": inverter_eff,
        },
        "data_quality": quality.value,
        "model_version": MODEL_VERSION,
    }


def _pick_recommendation(
    solar_analysis: Dict[str, Any],
    wind_analysis: Dict[str, Any],
    financial_analysis: Dict[str, Any],
    hybrid_analysis: Dict[str, Any],
    quality: DataQuality,
) -> Dict[str, Any]:
    recommendations: Dict[str, Any] = {
        "recommended_technology": "unknown",
        "confidence": "low",
        "reasoning": [],
    }

    if solar_analysis and wind_analysis:
        solar_score = 0
        wind_score = 0
        if (
            solar_analysis["estimated_capacity_factor_percent"]
            > wind_analysis["estimated_capacity_factor_percent"]
        ):
            solar_score += 2
            recommendations["reasoning"].append("Solar has higher capacity factor")
        else:
            wind_score += 2
            recommendations["reasoning"].append("Wind has higher capacity factor")

        solar_lcoe = financial_analysis.get("solar", {}).get(
            "lcoe_usd_per_mwh", float("inf")
        )
        wind_lcoe = financial_analysis.get("wind", {}).get(
            "lcoe_usd_per_mwh", float("inf")
        )
        if solar_lcoe < wind_lcoe:
            solar_score += 2
            recommendations["reasoning"].append("Solar has lower LCOE")
        else:
            wind_score += 2
            recommendations["reasoning"].append("Wind has lower LCOE")

        if solar_analysis["solar_resource_class"] in ("Excellent", "Good"):
            solar_score += 1
        if wind_analysis["wind_resource_class"] in ("Excellent", "Good"):
            wind_score += 1

        solar_payback = financial_analysis.get("solar", {}).get(
            "payback_years", float("inf")
        )
        wind_payback = financial_analysis.get("wind", {}).get(
            "payback_years", float("inf")
        )
        if solar_payback < wind_payback and solar_payback < 15:
            solar_score += 1
        elif wind_payback < solar_payback and wind_payback < 15:
            wind_score += 1

        hybrid_lcoe = hybrid_analysis.get("lcoe_usd_per_mwh", float("inf"))
        if hybrid_analysis and hybrid_lcoe < min(solar_lcoe, wind_lcoe):
            recommendations["recommended_technology"] = "hybrid"
            desired = "high" if abs(solar_score - wind_score) <= 1 else "medium"
            recommendations["confidence"] = _clamp_confidence(desired, quality)
            recommendations["reasoning"].append(
                "Hybrid offers best financial performance"
            )
        elif solar_score > wind_score:
            recommendations["recommended_technology"] = "solar"
            recommendations["confidence"] = _clamp_confidence(
                "high" if solar_score >= 4 else "medium", quality
            )
        else:
            recommendations["recommended_technology"] = "wind"
            recommendations["confidence"] = _clamp_confidence(
                "high" if wind_score >= 4 else "medium", quality
            )
    elif solar_analysis:
        recommendations["recommended_technology"] = "solar"
        recommendations["confidence"] = _clamp_confidence("medium", quality)
        recommendations["reasoning"].append("Only solar resource data available")
    elif wind_analysis:
        recommendations["recommended_technology"] = "wind"
        recommendations["confidence"] = _clamp_confidence("medium", quality)
        recommendations["reasoning"].append("Only wind resource data available")

    return recommendations
