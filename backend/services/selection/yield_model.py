"""
Nameplate yield and finance helpers for technology selection.

Invariant: capacity_mw is AC nameplate. Solar AC kW is
nameplate_kW * (POA/1000) * temperature_factor * (1 - system_loss) * inverter_efficiency.
Module efficiency is not applied a second time.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Iterable, List, Optional, Sequence, Tuple

import numpy as np
from scipy.interpolate import interp1d


HOURS_PER_YEAR = 8760.0
MODEL_VERSION = "nameplate-v1"


class DataQuality(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INSUFFICIENT = "insufficient"


@dataclass(frozen=True)
class AnnualEnergy:
    annual_mwh: float
    sample_hours: float
    scale_factor: float


@dataclass(frozen=True)
class FinanceResult:
    capex_usd: float
    annual_revenue_usd: float
    annual_opex_usd: float
    lcoe_usd_per_mwh: Optional[float]
    payback_years: Optional[float]
    npv_usd: float


def temperature_factor(
    poa_w_m2: float,
    temp_air_c: float = 25.0,
    noct: float = 45.0,
    temp_coeff: float = -0.004,
    wind_speed_m_s: float = 0.0,
) -> float:
    """NOCT cell temperature with optional wind cooling; returns derate factor."""
    temp_cell = temp_air_c + (noct - 20.0) * (poa_w_m2 / 800.0)
    if wind_speed_m_s > 0:
        wind_cooling = float(np.exp(-0.1 * wind_speed_m_s))
        temp_cell = temp_air_c + (temp_cell - temp_air_c) * wind_cooling
    return 1.0 + temp_coeff * (temp_cell - 25.0)


def solar_ac_kw(
    nameplate_mw: float,
    poa_w_m2: float,
    *,
    system_loss: float = 0.14,
    inverter_efficiency: float = 0.96,
    temp_air_c: float = 25.0,
    noct: float = 45.0,
    temp_coeff: float = -0.004,
    wind_speed_m_s: float = 0.0,
) -> float:
    """
    AC power from nameplate and plane-of-array irradiance.

    Nameplate already assumes 1000 W/m² STC; do not multiply by module efficiency.
    """
    if nameplate_mw <= 0 or poa_w_m2 <= 0:
        return 0.0
    nameplate_kw = nameplate_mw * 1000.0
    tf = temperature_factor(
        poa_w_m2,
        temp_air_c=temp_air_c,
        noct=noct,
        temp_coeff=temp_coeff,
        wind_speed_m_s=wind_speed_m_s,
    )
    power = (
        nameplate_kw
        * (poa_w_m2 / 1000.0)
        * tf
        * (1.0 - system_loss)
        * inverter_efficiency
    )
    return max(0.0, float(power))


def hub_height_wind_speed(
    wind_speed_m_s: float,
    hub_height_m: float,
    measurement_height_m: float = 10.0,
    alpha: float = 0.14,
) -> float:
    if wind_speed_m_s <= 0 or hub_height_m <= 0 or measurement_height_m <= 0:
        return 0.0
    return float(wind_speed_m_s * (hub_height_m / measurement_height_m) ** alpha)


def default_power_curve(rated_power_kw: float) -> List[Tuple[float, float]]:
    """Generic curve scaled to rated power (kW)."""
    base = [
        (0, 0),
        (3, 0),
        (4, 50),
        (5, 150),
        (6, 300),
        (7, 500),
        (8, 650),
        (9, 750),
        (10, 850),
        (11, 920),
        (12, 980),
        (13, 1000),
        (14, 1000),
        (15, 1000),
        (20, 1000),
        (25, 0),
    ]
    scale = rated_power_kw / 1000.0 if rated_power_kw else 1.0
    return [(s, p * scale) for s, p in base]


def wind_ac_kw(
    nameplate_mw: float,
    wind_speed_m_s: float,
    *,
    hub_height_m: float = 80.0,
    cut_in_speed: float = 3.0,
    rated_speed: float = 12.0,
    cut_out_speed: float = 25.0,
    wake_loss: float = 0.0,
    air_density: float = 1.225,
    power_curve: Optional[Sequence[Tuple[float, float]]] = None,
    measurement_height_m: float = 10.0,
) -> float:
    """
    Deterministic wind power from hub-height shear and a power curve.

    No random turbulence. Wake is an explicit fraction (default 0 for one turbine).
    """
    if nameplate_mw <= 0 or wind_speed_m_s is None:
        return 0.0
    rated_kw = nameplate_mw * 1000.0
    hub_ws = hub_height_wind_speed(
        float(wind_speed_m_s),
        hub_height_m,
        measurement_height_m=measurement_height_m,
    )
    if hub_ws < cut_in_speed or hub_ws >= cut_out_speed:
        return 0.0

    curve = list(power_curve) if power_curve else default_power_curve(rated_kw)
    speeds, powers = zip(*[(float(s), float(p)) for s, p in curve])
    curve_fn = interp1d(
        speeds,
        powers,
        bounds_error=False,
        fill_value=0.0,
        kind="linear",
    )
    theoretical = float(curve_fn(hub_ws))
    if rated_speed <= hub_ws < cut_out_speed and theoretical <= 0:
        theoretical = rated_kw
    theoretical = min(rated_kw, max(0.0, theoretical))

    density_correction = air_density / 1.225
    wake = max(0.0, min(1.0, wake_loss))
    return max(0.0, theoretical * density_correction * (1.0 - wake))


def annualise(hourly_kwh: Iterable[float], sample_hours: float) -> AnnualEnergy:
    """Scale sample energy to a year when sample_hours > 0."""
    energy_kwh = float(sum(hourly_kwh))
    hours = float(sample_hours)
    if hours <= 0:
        return AnnualEnergy(annual_mwh=0.0, sample_hours=0.0, scale_factor=0.0)
    scale = HOURS_PER_YEAR / hours
    return AnnualEnergy(
        annual_mwh=energy_kwh * scale / 1000.0,
        sample_hours=hours,
        scale_factor=scale,
    )


def capital_recovery_factor(discount_rate: float, lifetime_years: int) -> float:
    """CRF = r(1+r)^n / ((1+r)^n - 1). Zero rate uses 1/n."""
    n = max(1, int(lifetime_years))
    r = float(discount_rate)
    if r <= 0:
        return 1.0 / n
    factor = (1.0 + r) ** n
    return r * factor / (factor - 1.0)


def finance(
    annual_mwh: float,
    capex_usd: float,
    price_per_mwh: float,
    *,
    opex_per_year: float = 0.0,
    discount_rate: float = 0.08,
    lifetime_years: int = 20,
) -> FinanceResult:
    """Revenue is annual_MWh * price. LCOE uses CRF; NPV discounts yearly net."""
    annual_revenue = float(annual_mwh) * float(price_per_mwh)
    annual_opex = float(opex_per_year)
    crf = capital_recovery_factor(discount_rate, lifetime_years)
    if annual_mwh > 0:
        lcoe = (float(capex_usd) * crf + annual_opex) / float(annual_mwh)
    else:
        lcoe = None

    net = annual_revenue - annual_opex
    if net > 0 and capex_usd > 0:
        payback = float(capex_usd) / net
    elif capex_usd <= 0:
        payback = 0.0
    else:
        payback = None

    npv = -float(capex_usd)
    r = float(discount_rate)
    for year in range(1, max(1, int(lifetime_years)) + 1):
        npv += net / ((1.0 + r) ** year)

    return FinanceResult(
        capex_usd=round(float(capex_usd), 2),
        annual_revenue_usd=round(annual_revenue, 2),
        annual_opex_usd=round(annual_opex, 2),
        lcoe_usd_per_mwh=round(lcoe, 2) if lcoe is not None else None,
        payback_years=round(payback, 1) if payback is not None else None,
        npv_usd=round(npv, 2),
    )


def data_quality(
    sample_hours: float,
    *,
    gap_fraction: float = 0.0,
    source: str = "database",
    is_tmy: bool = False,
    has_ghi: bool = False,
    has_wind: bool = False,
) -> DataQuality:
    """
    Grade the weather series used for recommendation.

    High: full year or TMY with gaps under 5%.
    Medium: at least 90 days.
    Low: shorter samples (including OpenWeather 168h fallback).
    Insufficient: under 24 hours or neither GHI nor wind.
    """
    if not has_ghi and not has_wind:
        return DataQuality.INSUFFICIENT
    if sample_hours < 24:
        return DataQuality.INSUFFICIENT
    if source == "openweather_api" and sample_hours < HOURS_PER_YEAR:
        # API fallback is capped; never high
        if sample_hours >= 90 * 24:
            return DataQuality.MEDIUM
        return DataQuality.LOW
    if (is_tmy or sample_hours >= HOURS_PER_YEAR) and gap_fraction < 0.05:
        return DataQuality.HIGH
    if sample_hours >= 90 * 24:
        return DataQuality.MEDIUM
    return DataQuality.LOW


def plane_of_array_w_m2(
    ghi: float,
    timestamp: datetime,
    latitude: float,
    longitude: float,
    tilt: float = 30.0,
    azimuth: float = 180.0,
    dni: Optional[float] = None,
    dhi: Optional[float] = None,
) -> float:
    """POA via pvlib isotropic transposition; falls back to GHI if sun is down."""
    import pandas as pd
    from pvlib import irradiance, solarposition

    if ghi is None or ghi <= 0:
        return 0.0

    if timestamp.tzinfo is None:
        times = pd.DatetimeIndex([timestamp], tz="UTC")
    else:
        times = pd.DatetimeIndex([timestamp])

    solpos = solarposition.get_solarposition(times, latitude, longitude)
    apparent_zenith = float(np.asarray(solpos["apparent_zenith"]).reshape(-1)[0])
    solar_azimuth = float(np.asarray(solpos["azimuth"]).reshape(-1)[0])
    if apparent_zenith >= 90:
        return 0.0

    if dni is not None and dhi is not None:
        dni_val = float(dni)
        dhi_val = float(dhi)
    else:
        erbs = irradiance.erbs(ghi=ghi, zenith=apparent_zenith, datetime_or_doy=times)
        dni_val = float(np.asarray(erbs["dni"]).reshape(-1)[0])
        dhi_val = float(np.asarray(erbs["dhi"]).reshape(-1)[0])

    poa = irradiance.get_total_irradiance(
        surface_tilt=tilt,
        surface_azimuth=azimuth,
        solar_zenith=apparent_zenith,
        solar_azimuth=solar_azimuth,
        ghi=ghi,
        dni=dni_val,
        dhi=dhi_val,
        model="isotropic",
    )
    return max(0.0, float(np.asarray(poa["poa_global"]).reshape(-1)[0]))


def air_density_kg_m3(
    temperature_c: Optional[float] = None,
    pressure_hpa: Optional[float] = None,
) -> float:
    temp = temperature_c if temperature_c is not None else 15.0
    press = pressure_hpa if pressure_hpa is not None else 1013.25
    return (press * 100.0) / (287.05 * (temp + 273.15))
