"""Vendor catalogue matching (public contacts only)."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Sequence


VERIFICATION_MAX_AGE_DAYS = 18 * 30  # ~18 months


def match_vendors(
    options: Sequence[Dict[str, Any]],
    products: Sequence[Dict[str, Any]],
    *,
    country_code: Optional[str],
    today: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Match eligible options to vendor products by class, capacity band, and country.

    Sort by band tightness (max - min ascending). Empty when none match.
    """
    today = today or date.today()
    cutoff = today - timedelta(days=VERIFICATION_MAX_AGE_DAYS)
    country = (country_code or "").upper() or None
    matches: List[Dict[str, Any]] = []

    for opt in options:
        if not opt.get("eligible"):
            continue
        cls = opt.get("technology_class")
        capacity = opt.get("capacity_mw")
        if capacity is None and cls != "battery":
            continue
        # Battery matches on storage via capacity_mw proxy of 0 band or skip
        if cls == "battery":
            capacity = 0.0

        candidates = []
        for p in products:
            if p.get("technology_class") != cls:
                continue
            if not p.get("active", True):
                continue
            verified = p.get("last_verified_on")
            if isinstance(verified, str):
                verified = date.fromisoformat(verified)
            if verified is None or verified < cutoff:
                continue
            countries = p.get("countries") or []
            countries = [c.upper() for c in countries]
            if country and country not in countries:
                continue
            min_mw = float(p.get("min_capacity_mw", 0))
            max_mw = float(p.get("max_capacity_mw", 0))
            if cls != "battery" and not (min_mw <= float(capacity) <= max_mw):
                continue
            tightness = max_mw - min_mw
            candidates.append((tightness, p))

        candidates.sort(key=lambda x: x[0])
        for tightness, p in candidates:
            matches.append(
                {
                    "technology_class": cls,
                    "option_rank": opt.get("rank"),
                    "vendor_id": str(p.get("vendor_id") or p.get("id")),
                    "vendor_product_id": str(p.get("product_id") or p.get("id")),
                    "legal_name": p.get("legal_name"),
                    "website_url": p.get("website_url"),
                    "contact_url": p.get("contact_url"),
                    "min_capacity_mw": p.get("min_capacity_mw"),
                    "max_capacity_mw": p.get("max_capacity_mw"),
                    "last_verified_on": str(p.get("last_verified_on")),
                    "fit_notes": (
                        f"{p.get('legal_name')} covers {cls} "
                        f"({p.get('min_capacity_mw')}–{p.get('max_capacity_mw')} MW) "
                        f"in {(country or 'n/a')}"
                    ),
                }
            )

    return matches


def contact_draft(
    *,
    legal_name: str,
    technology_class: str,
    capacity_mw: Optional[float],
    contact_url: Optional[str],
    site_or_location: str,
) -> Dict[str, str]:
    subject = f"Enquiry: {technology_class} supply for {site_or_location}"
    capacity_line = (
        f"Indicative capacity: {capacity_mw} MW.\n"
        if capacity_mw is not None
        else ""
    )
    body = (
        f"Hello {legal_name},\n\n"
        f"We are evaluating {technology_class} for a project at {site_or_location}.\n"
        f"{capacity_line}"
        "Please share product availability, lead times, and public commercial contacts.\n\n"
        "Regards\n"
    )
    return {
        "subject": subject,
        "body": body,
        "contact_url": contact_url or "",
    }


def empty_vendor_message(country_code: Optional[str], technology_class: str) -> str:
    country = country_code or "this country"
    return (
        f"No listed vendor covers {technology_class} in {country}."
    )
