export type GridMode = 'firm_grid' | 'weak_grid' | 'off_grid';

export type RecommendationObjective =
  | 'min_cost_to_serve'
  | 'max_renewable_fraction'
  | 'min_payback';

export type TechnologyClass =
  | 'pv_fixed'
  | 'pv_tracker'
  | 'pv_rooftop'
  | 'wind_onshore'
  | 'wind_small'
  | 'battery'
  | 'hybrid';

export interface RecommendationOption {
  technology_class: TechnologyClass;
  rank: number;
  eligible: boolean;
  exclusion_reason?: string | null;
  capacity_mw?: number | null;
  storage_kwh?: number | null;
  solar_fraction?: number | null;
  annual_mwh?: number | null;
  renewable_fraction?: number | null;
  lcoe_usd_per_mwh?: number | null;
  payback_years?: number | null;
  npv_usd?: number | null;
  assumptions?: Record<string, unknown>;
}

export interface VendorMatch {
  technology_class: string;
  option_rank?: number;
  vendor_id: string;
  vendor_product_id: string;
  legal_name: string;
  website_url?: string;
  contact_url?: string;
  min_capacity_mw?: number;
  max_capacity_mw?: number;
  last_verified_on?: string;
  fit_notes: string;
}

export interface RecommendationRun {
  id?: string | null;
  latitude: number;
  longitude: number;
  country_code?: string | null;
  objective: RecommendationObjective;
  data_quality: string;
  model_version: string;
  load: {
    annual_kwh: number;
    peak_kw: number;
    critical_fraction: number;
    backup_hours: number;
    grid_mode: GridMode;
    hourly_shape_assumed: boolean;
  };
  options: RecommendationOption[];
  vendors: VendorMatch[];
  vendor_message?: string | null;
  assumptions: Record<string, unknown>;
}
