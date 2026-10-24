# ADR 0002: Light operator command centre (ops shell)

## Status

Accepted

## Context

The dashboard needed a coherent operator IA without a Vite migration or dark-mode energy chrome. Site detail already had Overview / Forecast / Analytics / Planning / Alerts tabs.

## Decision

1. Light-first MUI 5 theme: IBM Plex Sans, brand blue `#0C63DB`, teal for renewable/up status only.
2. Shared primitives: `PageHeader`, `KpiStrip`, `EmptyState`.
3. Shell: drawer wordmark, responsive drawer, Admin nav only when `user.role === 'admin'` after `GET /auth/me` (JWT also carries `role`).
4. Reorganise SiteDetail tab contents so Forecast is the moment of truth; deep-link with `?tab=1` from Forecasts overview.
5. Stay on Create React App + react-app-rewired for this pass.

## Consequences

- Backend Admin RBAC is still not enforced; hiding Admin is UI-only.
- Chart colour systems beyond ForecastChartSimple remain largely unchanged.
- Dark theme toggle and Vite migration remain out of scope.
