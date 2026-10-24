"""
Technology shortlist: screen constraints, size to load, search hybrid fraction.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from services.selection.yield_model import (
    HOURS_PER_YEAR,
    annualise,
    finance,
    hub_height_wind_speed,
    solar_ac_kw,
    wind_ac_kw,
)

TECHNOLOGY_CLASSES = (
    "pv_fixed",
    "pv_tracker",
    "pv_rooftop",
    "wind_onshore",
    "wind_small",
    "battery",
    "hybrid",
)

# Rough land-use density (MW per m²) for area screening
PV_MW_PER_M2 = 0.00015  # ~150 W/m² DC packing
WIND_MW_PER_M2 = 0.00001
SMALL_WIND_MAX_MW = 0.1
ROUND_TRIP_EFF = 0.90


@dataclass
class Constraints:
    roof_only: bool = False
    max_area_m2: Optional[float] = None
    budget_capex: Optional[float] = None
    max_turbine_height_m: Optional[float] = None
    grid_mode: str = "firm_grid"
    backup_hours: float = 0.0
    critical_fraction: float = 0.0
    peak_kw: float = 0.0
    annual_kwh: float = 0.0


@dataclass
class CapexInputs:
    """Caller-supplied $/MW (or $/kWh for battery). Missing → no LCOE."""
    pv_fixed: Optional[float] = None
    pv_tracker: Optional[float] = None
    pv_rooftop: Optional[float] = None
    wind_onshore: Optional[float] = None
    wind_small: Optional[float] = None
    battery_per_kwh: Optional[float] = None
    hybrid: Optional[float] = None
    energy_price_per_mwh: float = 50.0
    discount_rate: float = 0.08
    lifetime_years: int = 20


@dataclass
class OptionResult:
    technology_class: str
    rank: int
    eligible: bool
    exclusion_reason: Optional[str] = None
    capacity_mw: Optional[float] = None
    storage_kwh: Optional[float] = None
    solar_fraction: Optional[float] = None
    annual_mwh: Optional[float] = None
    renewable_fraction: Optional[float] = None
    lcoe_usd_per_mwh: Optional[float] = None
    payback_years: Optional[float] = None
    npv_usd: Optional[float] = None
    assumptions: Dict[str, Any] = field(default_factory=dict)
    iec_wind_class: Optional[str] = None


def iec_wind_class_label(mean_hub_speed_m_s: float) -> str:
    """Sizing tag from mean hub-height speed (not a certification)."""
    if mean_hub_speed_m_s >= 8.5:
        return "I"
    if mean_hub_speed_m_s >= 7.5:
        return "II"
    return "III"


def _mean_ghi(rows: Sequence[Dict[str, Any]]) -> float:
    vals = [float(r["ghi"]) for r in rows if r.get("ghi") is not None]
    return sum(vals) / len(vals) if vals else 0.0


def _mean_wind(rows: Sequence[Dict[str, Any]], hub_height_m: float = 80.0) -> float:
    vals = []
    for r in rows:
        if r.get("wind_speed") is None:
            continue
        vals.append(hub_height_wind_speed(float(r["wind_speed"]), hub_height_m))
    return sum(vals) / len(vals) if vals else 0.0


def _solar_cf_from_rows(
    rows: Sequence[Dict[str, Any]],
    *,
    tracker: bool = False,
) -> float:
    """Approximate capacity factor treating GHI (or 1.15× for tracker) as POA."""
    if not rows:
        return 0.0
    factor = 1.15 if tracker else 1.0
    hourly = []
    for r in rows:
        ghi = r.get("ghi")
        if ghi is None:
            continue
        poa = float(ghi) * factor
        hourly.append(
            solar_ac_kw(
                1.0,
                poa,
                system_loss=0.14,
                inverter_efficiency=0.96,
                temp_coeff=-0.004,
                temp_air_c=float(r.get("ambient_temp") or r.get("temperature") or 25.0),
            )
        )
    if not hourly:
        return 0.0
    annual = annualise(hourly, float(len(hourly)))
    return annual.annual_mwh / HOURS_PER_YEAR  # for 1 MW nameplate → CF


def _wind_cf_from_rows(rows: Sequence[Dict[str, Any]], hub_height_m: float = 80.0) -> float:
    if not rows:
        return 0.0
    hourly = []
    for r in rows:
        if r.get("wind_speed") is None:
            continue
        hourly.append(
            wind_ac_kw(
                1.0,
                float(r["wind_speed"]),
                hub_height_m=hub_height_m,
                wake_loss=0.0,
            )
        )
    if not hourly:
        return 0.0
    annual = annualise(hourly, float(len(hourly)))
    return annual.annual_mwh / HOURS_PER_YEAR


def _size_mw_for_load(annual_kwh: float, capacity_factor: float) -> float:
    if capacity_factor <= 0 or annual_kwh <= 0:
        return 0.0
    annual_mwh = annual_kwh / 1000.0
    # annual_mwh = capacity_mw * 8760 * CF
    return annual_mwh / (HOURS_PER_YEAR * capacity_factor)


def _capex_for(cls: str, capacity_mw: float, storage_kwh: float, caps: CapexInputs) -> Optional[float]:
    mapping = {
        "pv_fixed": caps.pv_fixed,
        "pv_tracker": caps.pv_tracker,
        "pv_rooftop": caps.pv_rooftop,
        "wind_onshore": caps.wind_onshore,
        "wind_small": caps.wind_small,
        "hybrid": caps.hybrid,
    }
    if cls == "battery":
        if caps.battery_per_kwh is None:
            return None
        return storage_kwh * caps.battery_per_kwh
    rate = mapping.get(cls)
    if rate is None:
        return None
    return capacity_mw * rate


def build_options(
    weather_rows: Sequence[Dict[str, Any]],
    constraints: Constraints,
    caps: CapexInputs,
    *,
    objective: str = "min_cost_to_serve",
    hub_height_m: float = 80.0,
) -> List[OptionResult]:
    solar_cf = _solar_cf_from_rows(weather_rows, tracker=False)
    tracker_cf = _solar_cf_from_rows(weather_rows, tracker=True)
    wind_cf = _wind_cf_from_rows(weather_rows, hub_height_m=hub_height_m)
    mean_hub = _mean_wind(weather_rows, hub_height_m=hub_height_m)
    mean_ghi = _mean_ghi(weather_rows)

    results: List[OptionResult] = []

    for cls in TECHNOLOGY_CLASSES:
        reason = _exclusion_reason(cls, constraints, mean_hub, mean_ghi, solar_cf, wind_cf)
        if reason:
            results.append(
                OptionResult(
                    technology_class=cls,
                    rank=99,
                    eligible=False,
                    exclusion_reason=reason,
                    assumptions={"mean_ghi": mean_ghi, "mean_hub_wind": mean_hub},
                )
            )
            continue

        if cls == "battery":
            storage_kwh = (
                constraints.peak_kw
                * constraints.critical_fraction
                * constraints.backup_hours
            )
            opt = OptionResult(
                technology_class=cls,
                rank=0,
                eligible=True,
                capacity_mw=None,
                storage_kwh=round(storage_kwh, 2),
                annual_mwh=0.0,
                renewable_fraction=0.0,
                assumptions={
                    "round_trip_efficiency": ROUND_TRIP_EFF,
                    "role": "backup_and_shifting",
                },
            )
            capex = _capex_for(cls, 0.0, storage_kwh, caps)
            if capex is not None:
                # Battery alone has no generation revenue in this model
                opt.npv_usd = round(-capex, 2)
                opt.assumptions["capex_usd"] = round(capex, 2)
            results.append(opt)
            continue

        if cls == "hybrid":
            best = _search_hybrid(
                constraints, caps, solar_cf, wind_cf, objective, mean_hub
            )
            results.append(best)
            continue

        cf = {
            "pv_fixed": solar_cf,
            "pv_tracker": tracker_cf,
            "pv_rooftop": solar_cf,
            "wind_onshore": wind_cf,
            "wind_small": wind_cf,
        }[cls]
        capacity_mw = _size_mw_for_load(constraints.annual_kwh, cf)
        if cls == "wind_small" and capacity_mw > SMALL_WIND_MAX_MW:
            capacity_mw = SMALL_WIND_MAX_MW

        if constraints.max_area_m2 is not None:
            density = PV_MW_PER_M2 if cls.startswith("pv") else WIND_MW_PER_M2
            max_mw = constraints.max_area_m2 * density
            if capacity_mw > max_mw:
                capacity_mw = max_mw

        annual_mwh = capacity_mw * HOURS_PER_YEAR * cf
        load_mwh = constraints.annual_kwh / 1000.0
        renewable_fraction = min(1.0, annual_mwh / load_mwh) if load_mwh > 0 else 0.0

        opt = OptionResult(
            technology_class=cls,
            rank=0,
            eligible=True,
            capacity_mw=round(capacity_mw, 3),
            annual_mwh=round(annual_mwh, 3),
            renewable_fraction=round(renewable_fraction, 3),
            assumptions={
                "capacity_factor": round(cf, 4),
                "mean_ghi": mean_ghi,
                "mean_hub_wind": mean_hub,
            },
            iec_wind_class=iec_wind_class_label(mean_hub)
            if cls.startswith("wind")
            else None,
        )
        if opt.iec_wind_class:
            opt.assumptions["iec_wind_class_label"] = opt.iec_wind_class

        capex = _capex_for(cls, capacity_mw, 0.0, caps)
        if constraints.budget_capex is not None and capex is not None:
            if capex > constraints.budget_capex:
                opt.eligible = False
                opt.exclusion_reason = "Exceeds budget cap"
                results.append(opt)
                continue

        if capex is not None:
            fin = finance(
                annual_mwh,
                capex,
                caps.energy_price_per_mwh,
                discount_rate=caps.discount_rate,
                lifetime_years=caps.lifetime_years,
            )
            opt.lcoe_usd_per_mwh = fin.lcoe_usd_per_mwh
            opt.payback_years = fin.payback_years
            opt.npv_usd = fin.npv_usd
            opt.assumptions["capex_usd"] = fin.capex_usd
        results.append(opt)

    return _rank(results, objective)


def _exclusion_reason(
    cls: str,
    constraints: Constraints,
    mean_hub: float,
    mean_ghi: float,
    solar_cf: float,
    wind_cf: float,
) -> Optional[str]:
    if constraints.roof_only and cls in ("pv_tracker", "wind_onshore", "wind_small"):
        return "Excluded: roof only"
    if (
        constraints.max_turbine_height_m is not None
        and constraints.max_turbine_height_m < 40
        and cls == "wind_onshore"
    ):
        return "Excluded: hub height cap below 40 m"
    if (
        constraints.grid_mode == "off_grid"
        and constraints.backup_hours <= 0
        and cls != "battery"
    ):
        # Generation-only options cannot cover off-grid without storage
        if cls != "hybrid":
            return "Excluded: off-grid requires backup hours or storage"
    if cls.startswith("pv") and solar_cf <= 0:
        return "Excluded: insufficient solar resource"
    if cls.startswith("wind") and (wind_cf <= 0 or mean_hub < 3.0):
        return "Excluded: mean hub-height wind below cut-in"
    if cls == "wind_small" and constraints.annual_kwh / 1000.0 > (
        SMALL_WIND_MAX_MW * HOURS_PER_YEAR * max(wind_cf, 0.01)
    ):
        # Still allow sizing capped; do not exclude solely on load
        pass
    if constraints.max_area_m2 is not None and constraints.max_area_m2 <= 0:
        return "Excluded: no available area"
    return None


def _search_hybrid(
    constraints: Constraints,
    caps: CapexInputs,
    solar_cf: float,
    wind_cf: float,
    objective: str,
    mean_hub: float,
) -> OptionResult:
    best: Optional[OptionResult] = None
    best_score = float("inf")
    load_mwh = constraints.annual_kwh / 1000.0

    for frac in (0.0, 0.25, 0.5, 0.75, 1.0):
        # Size total nameplate so blended CF meets load
        blended_cf = frac * solar_cf + (1.0 - frac) * wind_cf
        if blended_cf <= 0:
            continue
        capacity_mw = _size_mw_for_load(constraints.annual_kwh, blended_cf)
        solar_mw = capacity_mw * frac
        wind_mw = capacity_mw * (1.0 - frac)
        annual_mwh = capacity_mw * HOURS_PER_YEAR * blended_cf
        renewable_fraction = min(1.0, annual_mwh / load_mwh) if load_mwh > 0 else 0.0

        solar_rate = caps.pv_fixed
        wind_rate = caps.wind_onshore
        capex = None
        if solar_rate is not None and wind_rate is not None:
            capex = solar_mw * solar_rate + wind_mw * wind_rate
        elif caps.hybrid is not None:
            capex = capacity_mw * caps.hybrid

        lcoe = payback = npv = None
        if capex is not None:
            fin = finance(
                annual_mwh,
                capex,
                caps.energy_price_per_mwh,
                discount_rate=caps.discount_rate,
                lifetime_years=caps.lifetime_years,
            )
            lcoe = fin.lcoe_usd_per_mwh
            payback = fin.payback_years
            npv = fin.npv_usd

        score = _objective_score(objective, lcoe, payback, renewable_fraction, npv)
        cand = OptionResult(
            technology_class="hybrid",
            rank=0,
            eligible=True,
            capacity_mw=round(capacity_mw, 3),
            solar_fraction=frac,
            annual_mwh=round(annual_mwh, 3),
            renewable_fraction=round(renewable_fraction, 3),
            lcoe_usd_per_mwh=lcoe,
            payback_years=payback,
            npv_usd=npv,
            assumptions={
                "solar_cf": round(solar_cf, 4),
                "wind_cf": round(wind_cf, 4),
                "blended_cf": round(blended_cf, 4),
                "mean_hub_wind": mean_hub,
                "iec_wind_class_label": iec_wind_class_label(mean_hub),
                "capex_usd": round(capex, 2) if capex is not None else None,
            },
        )
        if best is None or score < best_score:
            best = cand
            best_score = score

    if best is None:
        return OptionResult(
            technology_class="hybrid",
            rank=99,
            eligible=False,
            exclusion_reason="Excluded: cannot size hybrid for this resource",
        )
    return best


def _objective_score(
    objective: str,
    lcoe: Optional[float],
    payback: Optional[float],
    renewable_fraction: float,
    npv: Optional[float],
) -> float:
    if objective == "max_renewable_fraction":
        return -renewable_fraction
    if objective == "min_payback":
        return payback if payback is not None else 1e9
    # min_cost_to_serve
    if lcoe is not None:
        return lcoe
    if npv is not None:
        return -npv
    return 1e9


def _rank(options: List[OptionResult], objective: str) -> List[OptionResult]:
    eligible = [o for o in options if o.eligible]
    ineligible = [o for o in options if not o.eligible]
    eligible.sort(
        key=lambda o: _objective_score(
            objective,
            o.lcoe_usd_per_mwh,
            o.payback_years,
            o.renewable_fraction or 0.0,
            o.npv_usd,
        )
    )
    for i, o in enumerate(eligible, start=1):
        o.rank = i
    for o in ineligible:
        o.rank = 100 + len(eligible)
    return eligible + ineligible


def options_as_dicts(options: List[OptionResult]) -> List[Dict[str, Any]]:
    out = []
    for o in options:
        out.append(
            {
                "technology_class": o.technology_class,
                "rank": o.rank,
                "eligible": o.eligible,
                "exclusion_reason": o.exclusion_reason,
                "capacity_mw": o.capacity_mw,
                "storage_kwh": o.storage_kwh,
                "solar_fraction": o.solar_fraction,
                "annual_mwh": o.annual_mwh,
                "renewable_fraction": o.renewable_fraction,
                "lcoe_usd_per_mwh": o.lcoe_usd_per_mwh,
                "payback_years": o.payback_years,
                "npv_usd": o.npv_usd,
                "assumptions": o.assumptions,
            }
        )
    return out
