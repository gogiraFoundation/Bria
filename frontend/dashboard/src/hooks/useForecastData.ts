import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface ForecastData {
  siteId: string;
  siteName?: string;
  siteType?: string;
  capacity?: number;
  timestamps: string[];
  values: number[] | any[]; // Can be numbers or objects from raw API
  confidenceIntervals?: {
    p10: number[];
    p50: number[];
    p90: number[];
  };
  actuals?: {
    timestamps: string[];
    values: number[];
  };
  forecast_generated?: string; // From raw API response
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
      
      // Extract site info from forecast
      const extractedSiteId = forecast.site_id || siteId;
      const siteName = forecast.site_name || undefined;
      const siteType = forecast.site_type || undefined;
      const capacity = forecast.capacity_kw || undefined;
      
      return {
        siteId: extractedSiteId,
        siteName,
        siteType,
        capacity,
        timestamps: forecast.values.map((v) => v.timestamp),
        values: forecast.values.map((v) => v.predicted_power_kw),
        confidenceIntervals: {
          p10: forecast.values.map((v) => v.p10_kw || v.p10 || v.predicted_power_kw * 0.8),
          p50: forecast.values.map((v) => v.p50_kw || v.p50 || v.predicted_power_kw),
          p90: forecast.values.map((v) => v.p90_kw || v.p90 || v.predicted_power_kw * 1.2),
        },
        forecast_generated: forecast.forecast_generated || forecast.forecast_time,
      };
    },
    enabled: enabled && siteId !== 'placeholder',
    refetchInterval: 300000, // Refetch every 5 minutes
  });
};

