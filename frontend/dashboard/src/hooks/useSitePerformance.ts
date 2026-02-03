import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface SitePerformance {
  site_id: string;
  period_days: number;
  capacity_mw: number;
  capacity_factor: number;
  average_power_kw: number;
  max_power_kw: number;
  min_power_kw?: number;
  total_energy_kwh: number;
  average_availability: number;
  average_efficiency: number;
  data_points: number;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

export const useSitePerformance = (siteId: string, days: number = 30) => {
  return useQuery<SitePerformance>({
    queryKey: ['site-performance', siteId, days],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/performance?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
    enabled: !!siteId,
    staleTime: 300000, // 5 minutes
  });
};

