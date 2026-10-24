# Frontend dashboard

Path: `frontend/dashboard/`. Light operator command centre on React 18 + MUI 5.

Related: [CODEBASE.md](./CODEBASE.md), ADR [0002](./adr/0002-ops-shell-ui.md).

---

## Stack

| Piece | Choice |
| --- | --- |
| Framework | React 18, TypeScript |
| UI | MUI 5, Emotion |
| Data | TanStack Query v5, axios |
| Routing | React Router 6 |
| Charts / maps | Plotly, Leaflet |
| Build | Create React App via `react-app-rewired` (`config-overrides.js`) |

Scripts: `npm start` (:3000), `npm run build`, `npm test`.

Env (optional `frontend/dashboard/.env` or shell):

| Variable | Default |
| --- | --- |
| `REACT_APP_API_URL` | `http://localhost:8000/api` |
| `REACT_APP_WS_URL` | `ws://localhost:8000/api/v1/ws/forecast` |
| `REACT_APP_ALLOW_REGISTRATION` | unset / false |

---

## Theme and primitives

- `src/theme.ts`: background `#F7F8FA`, primary `#0C63DB`, secondary teal `#0D9488`, IBM Plex Sans (`public/index.html`), radius 8, focus-visible outline.
- `src/components/ui/PageHeader.tsx`, `KpiStrip.tsx`, `EmptyState.tsx`
- `src/components/ForecastStatusChip.tsx`: Available / Unavailable from forecast hook

---

## Shell and auth

- `AuthContext`: token in `localStorage`; bootstrap `GET /auth/me`; JWT role fallback on non-401 `/me` failures; logout clears session.
- `DashboardLayout` nav: **Sites**, **Plan**, **Forecasts**, **Alerts**; **Admin** only if `user.role === 'admin'`.
- Permanent drawer from MUI `md` (≥900px); temporary drawer + menu button below.
- Brand wordmark “Bria” in the drawer; user menu with logout.

Login (`/login`): brand-first “Bria”, “Renewable generation forecasts”, primary “Sign in”. Register tab only when `REACT_APP_ALLOW_REGISTRATION=true`.

---

## Routes

| Path | Page | Notes |
| --- | --- | --- |
| `/login` | Login | Outside shell |
| `/change-password` | ChangePassword | Outside shell |
| `/` | SiteOverview | KPIs, empty state, group/sort, create/delete site |
| `/sites/:siteId` | SiteDetail | Tabs; `?tab=` index or name |
| `/forecast` | ForecastsOverview | Deep-link `?tab=1` to site Forecast |
| `/forecast/:siteId` | SiteDetail | Same detail page |
| `/plan` | PlanRecommendation | Standalone tech recommendation run |
| `/alerts` | AlertManagement | |
| `/admin` | SystemAdmin | Stub UI; vendor APIs exist for admins |

`ForecastDetail.tsx` is not wired in `App.tsx`.

---

## Site detail tab IA

| Tab | Contents |
| --- | --- |
| Overview | Status, performance KPIs, map, site info, edit |
| Forecast | Horizon, chart, current weather, accuracy, suggestions, export |
| Analytics | Performance, analytics dashboard, weather/production history |
| Planning | Scheduling, adjustments, comparison, technology recommendation, AI insights |
| Alerts | Panel + create |

Unavailable forecasts: warning alert in `ForecastChartSimple` (no invented series).

---

## Site creation

`CreateSiteFormEnhanced` (Sites → Add site):

- Tabs for type, location (manual coordinates, geocode via `POST /geocode`, or geolocation), equipment, terrain, financials, metadata.
- Hybrid sites persist both `pv_params` and `turbine_params` (including nested equipment / financial / metadata where filled).
- Location is required before submit.

---

## Plan page

`PlanRecommendation` posts to `POST /api/v1/recommendations` with location, load, grid mode, objective, and cost assumptions. Results list technology options and optional vendor matches; contact draft via `POST /recommendations/{id}/contact-draft`.

This is separate from Site detail → Planning → Technology recommendation (site-bound historical analysis).

---

## Data hooks

| Hook | Backend |
| --- | --- |
| `useForecastData` | `GET .../forecast?horizon={n}h&include_confidence=true` |
| `useWeatherHistory` | weather history |
| `useProductionHistory` | production history |
| `useSitePerformance` | performance |

WebSocket: `WebSocketContext` appends the access token to `REACT_APP_WS_URL`.

---

## Local troubleshooting

Webpack / polyfill issues: clear `node_modules/.cache` and restart (`README_FRONTEND.md`). File-watcher EMFILE on macOS: raise `ulimit -n` before `npm start`.
