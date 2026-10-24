import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface ForecastData {
  siteId: string;
  siteName?: string;
  siteType?: string;
  capacity?: number;
  status?: string;
  weatherSource?: string | null;
  modelVersion?: string | null;
  reason?: string;
  timestamps: string[];
  values: number[] | any[];
  confidenceIntervals?: {
    p10: number[];
    p50: number[];
    p90: number[];
  };
  actuals?: {
    timestamps: string[];
    values: number[];
  };
  forecast_generated?: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

export const useForecastData = (siteId: string, horizon: number = 24, enabled: boolean = true) => {
  return useQuery<ForecastData>({
    queryKey: ['forecast', siteId, horizon],
    queryFn: async (): Promise<ForecastData> => {
      const token = localStorage.getItem('access_token');
      const response = await axios.get<{
        site_id: string;
        site_name?: string;
        site_type?: string;
        capacity_kw?: number;
        status?: string;
        weather_source?: string | null;
        model_version?: string | null;
        reason?: string;
        values: Array<{
          timestamp: string;
          predicted_power_kw: number;
          p10?: number;
          p10_kw?: number;
          p50?: number;
          p50_kw?: number;
          p90?: number;
          p90_kw?: number;
        }>;
        forecast_generated?: string;
        forecast_time?: string;
      }>(
        `${API_URL}/v1/sites/${siteId}/forecast?horizon=${horizon}h&include_confidence=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      const forecast = response.data;
      const extractedSiteId = forecast.site_id || siteId;
      const siteName = forecast.site_name || undefined;
      const siteType = forecast.site_type || undefined;
      const capacity = forecast.capacity_kw || undefined;
      const status = forecast.status || (forecast.values?.length ? 'ok' : 'unavailable');
      const values = Array.isArray(forecast.values) ? forecast.values : [];

      if (status === 'unavailable' || values.length === 0) {
        return {
          siteId: extractedSiteId,
          siteName,
          siteType,
          capacity,
          status: 'unavailable',
          weatherSource: forecast.weather_source ?? null,
          modelVersion: forecast.model_version ?? null,
          reason: forecast.reason,
          timestamps: [],
          values: [],
          forecast_generated: forecast.forecast_generated || forecast.forecast_time,
        };
      }

      return {
        siteId: extractedSiteId,
        siteName,
        siteType,
        capacity,
        status: 'ok',
        weatherSource: forecast.weather_source ?? null,
        modelVersion: forecast.model_version ?? null,
        timestamps: values.map((v) => v.timestamp),
        values: values.map((v) => v.predicted_power_kw),
        confidenceIntervals: {
          p10: values.map((v) =>
            v.p10_kw != null ? v.p10_kw : v.p10 != null ? v.p10 : v.predicted_power_kw
          ),
          p50: values.map((v) =>
            v.p50_kw != null ? v.p50_kw : v.p50 != null ? v.p50 : v.predicted_power_kw
          ),
          p90: values.map((v) =>
            v.p90_kw != null ? v.p90_kw : v.p90 != null ? v.p90 : v.predicted_power_kw
          ),
        },
        forecast_generated: forecast.forecast_generated || forecast.forecast_time,
      };
    },
    enabled: enabled && siteId !== 'placeholder',
    refetchInterval: 300000,
  });
};
