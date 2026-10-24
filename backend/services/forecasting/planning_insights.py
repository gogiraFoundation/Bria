"""
Factual scheduling and insight helpers for the Planning tab.

Solar and hybrid sites have a strong diurnal pattern. Night zeros and
dawn/dusk ramps are normal and must not be labelled anomalies or
maintenance windows.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple


def operating_floor_kw(capacity_kw: float) -> float:
    """Minimum power treated as 'operating' (not night / idle)."""
    return max(float(capacity_kw) * 0.05, 1.0)


def _parse_hour(timestamp: Optional[str]) -> Optional[int]:
    if not timestamp:
        return None
    try:
        # ISO with or without Z
        ts = timestamp.replace("Z", "+00:00")
        from datetime import datetime

        return datetime.fromisoformat(ts).hour
    except Exception:
        return None


def daytime_indices(
    powers: Sequence[float],
    timestamps: Sequence[Any],
    capacity_kw: float,
    site_type: str,
) -> List[int]:
    """
    Hours where generation is expected to be possible.

    Solar/hybrid: power above floor, or local hour roughly 08–17 UTC when
    power series is all zeros (fallback). Wind: all hours above floor, else all.
    """
    floor = operating_floor_kw(capacity_kw)
    idxs = [i for i, p in enumerate(powers) if p >= floor]
    if idxs:
        return idxs
    if site_type in ("solar", "hybrid"):
        hour_idxs = []
        for i, ts in enumerate(timestamps):
            h = _parse_hour(ts if isinstance(ts, str) else None)
            if h is not None and 8 <= h < 17:
                hour_idxs.append(i)
        return hour_idxs
    return list(range(len(powers)))


def coefficient_of_variation(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    if mean <= 0:
        return 0.0
    var = sum((v - mean) ** 2 for v in values) / len(values)
    return (var ** 0.5) / mean * 100.0


def build_scheduling_analysis(
    powers: Sequence[float],
    timestamps: Sequence[Any],
    capacity_kw: float,
    site_type: str,
    horizon_hours: int,
) -> Dict[str, Any]:
    powers_f = [float(p) for p in powers]
    if not powers_f or capacity_kw <= 0:
        return {
            "recommendations": [],
            "peak_periods": [],
            "maintenance_windows": [],
            "average_power_kw": 0.0,
            "forecast_summary": {
                "max_power_kw": 0.0,
                "min_power_kw": 0.0,
                "total_energy_kwh": 0.0,
            },
            "message": "Insufficient forecast data",
        }

    floor = operating_floor_kw(capacity_kw)
    day_idxs = daytime_indices(powers_f, timestamps, capacity_kw, site_type)
    day_pairs = [
        (powers_f[i], timestamps[i] if i < len(timestamps) else None) for i in day_idxs
    ]

    # Peaks among daytime (or all if wind with no floor hits)
    pool = day_pairs if day_pairs else list(
        zip(powers_f, [timestamps[i] if i < len(timestamps) else None for i in range(len(powers_f))])
    )
    pool_sorted = sorted(pool, key=lambda x: x[0], reverse=True)
    peak_n = max(1, min(5, len(pool_sorted)))
    peak_periods = [
        {
            "timestamp": ts,
            "power_kw": round(p, 2),
            "capacity_factor": round(p / capacity_kw * 100, 1),
        }
        for p, ts in pool_sorted[:peak_n]
        if p > 0
    ]

    # Maintenance: low *daytime* production only — never night zeros for solar
    maintenance_windows: List[Dict[str, Any]] = []
    if day_pairs and site_type in ("solar", "hybrid"):
        day_sorted = sorted(day_pairs, key=lambda x: x[0])
        # Bottom quartile of daytime, but still above night floor
        q = max(1, len(day_sorted) // 4)
        candidates = [
            (p, ts) for p, ts in day_sorted[:q] if floor <= p < 0.35 * capacity_kw
        ]
        maintenance_windows = [
            {
                "timestamp": ts,
                "power_kw": round(p, 2),
                "capacity_factor": round(p / capacity_kw * 100, 1),
            }
            for p, ts in candidates[:5]
        ]
    elif day_pairs:
        day_sorted = sorted(day_pairs, key=lambda x: x[0])
        q = max(1, len(day_sorted) // 5)
        maintenance_windows = [
            {
                "timestamp": ts,
                "power_kw": round(p, 2),
                "capacity_factor": round(p / capacity_kw * 100, 1),
            }
            for p, ts in day_sorted[:q][:5]
        ]

    avg_power = sum(powers_f) / len(powers_f)
    day_powers = [p for p, _ in day_pairs] if day_pairs else powers_f
    day_cv = coefficient_of_variation(day_powers)

    recommendations: List[Dict[str, Any]] = []
    if peak_periods:
        top = peak_periods[0]
        recommendations.append(
            {
                "type": "peak_production",
                "priority": "high",
                "title": "Peak production window",
                "description": (
                    f"Highest forecast point is {top['power_kw']:.0f} kW "
                    f"({top['capacity_factor']:.1f}% of nameplate). "
                    f"Top {len(peak_periods)} daytime hours listed below."
                ),
                "action": "Prioritise export or offtake during these hours",
                "impact": "Aligns dispatch with expected generation",
            }
        )

    if maintenance_windows:
        recommendations.append(
            {
                "type": "maintenance",
                "priority": "medium",
                "title": "Lower daytime production hours",
                "description": (
                    f"{len(maintenance_windows)} daytime hour(s) with reduced output "
                    f"(still above night idle). Prefer these over overnight for work "
                    f"that needs daylight access."
                ),
                "action": "Schedule non-critical work in these daytime troughs",
                "impact": "Avoids treating night zeros as maintenance slots",
            }
        )
    elif site_type in ("solar", "hybrid"):
        recommendations.append(
            {
                "type": "maintenance",
                "priority": "low",
                "title": "No suitable daytime maintenance trough",
                "description": (
                    "Overnight zeros are normal for solar and are not listed as "
                    "maintenance windows. No soft daytime trough met the threshold "
                    "in this horizon."
                ),
                "action": "Plan outages against the next longer-horizon forecast",
                "impact": "Prevents false overnight maintenance suggestions",
            }
        )

    # Daytime CV only; diurnal night-to-day must not trigger this
    if len(day_powers) >= 4 and day_cv > 55:
        recommendations.append(
            {
                "type": "variability",
                "priority": "medium",
                "title": "Daytime output variability",
                "description": (
                    f"Daytime coefficient of variation is {day_cv:.0f}% "
                    f"(std/mean of operating hours). Cloud or wind swings may "
                    f"justify flexible offtake or storage."
                ),
                "action": "Review flexible dispatch or short-duration storage",
                "impact": "Addresses operating-hour volatility only",
            }
        )

    step = horizon_hours / len(powers_f) if powers_f else 1.0
    return {
        "recommendations": recommendations,
        "peak_periods": peak_periods,
        "maintenance_windows": maintenance_windows,
        "average_power_kw": round(avg_power, 2),
        "forecast_summary": {
            "max_power_kw": round(max(powers_f), 2),
            "min_power_kw": round(min(powers_f), 2),
            "total_energy_kwh": round(sum(powers_f) * step, 2),
            "daytime_cv_percent": round(day_cv, 1),
            "peak_capacity_factor_percent": round(
                max(powers_f) / capacity_kw * 100, 1
            ),
        },
    }


def build_forecast_insights(
    powers: Sequence[float],
    timestamps: Sequence[Any],
    capacity_kw: float,
    site_type: str,
    mape: Optional[float] = None,
) -> Dict[str, Any]:
    powers_f = [float(p) for p in powers]
    insights: List[Dict[str, Any]] = []
    anomalies: List[Dict[str, Any]] = []
    recommendations: List[Dict[str, Any]] = []

    if not powers_f or capacity_kw <= 0:
        return {
            "insights": [],
            "anomalies": [],
            "recommendations": [],
            "summary": {
                "total_insights": 0,
                "total_anomalies": 0,
                "total_recommendations": 0,
                "high_priority_count": 0,
            },
        }

    floor = operating_floor_kw(capacity_kw)
    day_idxs = daytime_indices(powers_f, timestamps, capacity_kw, site_type)
    day_powers = [powers_f[i] for i in day_idxs] or powers_f

    # Anomalies: only between two operating points; ignore dawn/dusk and night
    for i in range(1, len(powers_f)):
        prev, curr = powers_f[i - 1], powers_f[i]
        if prev < floor or curr < floor:
            continue
        if abs(curr - prev) < 0.12 * capacity_kw:
            continue
        change_pct = ((curr - prev) / prev * 100.0) if prev > 0 else 0.0
        if abs(change_pct) < 40:
            continue
        anomalies.append(
            {
                "type": "sudden_change",
                "severity": "high" if abs(change_pct) > 60 else "medium",
                "timestamp": timestamps[i] if i < len(timestamps) else None,
                "change_percentage": round(change_pct, 1),
                "previous_power_kw": round(prev, 1),
                "current_power_kw": round(curr, 1),
                "message": (
                    f"Large step change of {abs(change_pct):.0f}% between operating "
                    f"hours ({prev:.0f} → {curr:.0f} kW). Check weather front or "
                    f"curtailment — not a sunrise/sunset ramp."
                ),
            }
        )
    anomalies = anomalies[:5]

    day_cv = coefficient_of_variation(day_powers)
    peak_cf = max(powers_f) / capacity_kw * 100.0
    day_avg_cf = (
        (sum(day_powers) / len(day_powers)) / capacity_kw * 100.0 if day_powers else 0.0
    )

    insights.append(
        {
            "type": "resource_summary",
            "severity": "low",
            "message": (
                f"Peak reaches {peak_cf:.1f}% of nameplate; daytime average "
                f"capacity factor {day_avg_cf:.1f}% over {len(day_powers)} operating hours."
            ),
            "recommendation": None,
        }
    )

    if site_type in ("solar", "hybrid"):
        night_hours = sum(1 for p in powers_f if p < floor)
        insights.append(
            {
                "type": "diurnal_pattern",
                "severity": "low",
                "message": (
                    f"Diurnal pattern: {night_hours} of {len(powers_f)} hours at or "
                    f"near zero (night/idle). That is expected for solar and is not "
                    f"an outage."
                ),
                "recommendation": None,
            }
        )

    if len(day_powers) >= 4 and day_cv > 55:
        insights.append(
            {
                "type": "high_variability",
                "severity": "medium",
                "message": (
                    f"Daytime coefficient of variation is {day_cv:.0f}% (std/mean). "
                    f"This measures operating-hour scatter, not night-to-day range."
                ),
                "recommendation": "Consider short-duration storage or flexible offtake",
            }
        )

    # Underperformance only if peak CF is very low for a clear daytime series
    if peak_cf < 15 and len(day_powers) >= 4:
        recommendations.append(
            {
                "type": "low_peak_output",
                "priority": "medium",
                "title": "Low peak relative to nameplate",
                "message": (
                    f"Forecast peak is only {peak_cf:.1f}% of the {capacity_kw/1000:.1f} MW "
                    f"nameplate. Confirm tilt, soiling, curtailment, or weather inputs."
                ),
                "action": "Verify site parameters and irradiance/wind inputs",
            }
        )
    elif peak_cf >= 50:
        recommendations.append(
            {
                "type": "peak_production_opportunity",
                "priority": "high",
                "title": "Strong peak window",
                "message": (
                    f"{sum(1 for p in powers_f if p >= 0.5 * capacity_kw)} hour(s) at or "
                    f"above 50% nameplate. Favourable for export."
                ),
                "action": "Maximise offtake during peak hours",
            }
        )

    if mape is not None and mape > 20:
        recommendations.append(
            {
                "type": "accuracy_degradation",
                "priority": "high",
                "title": "Forecast accuracy degradation",
                "message": (
                    f"Recent MAPE is {mape:.1f}%. Review model inputs or retrain when "
                    f"enough actuals exist."
                ),
                "action": "Review forecast accuracy trends",
            }
        )

    return {
        "insights": insights,
        "anomalies": anomalies,
        "recommendations": recommendations,
        "summary": {
            "total_insights": len(insights),
            "total_anomalies": len(anomalies),
            "total_recommendations": len(recommendations),
            "high_priority_count": len(
                [r for r in recommendations if r.get("priority") == "high"]
            ),
        },
    }
