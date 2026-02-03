import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface ProductionDataPoint {
  timestamp: string;
  power_kw: number | null;
  energy_kwh: number | null;
  availability: number | null;
}

interface ProductionHistory {
  site_id: string;
  period_days: number;
  data: ProductionDataPoint[];
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

export const useProductionHistory = (siteId: string, days: number = 7) => {
  return useQuery<ProductionHistory>({
    queryKey: ['production-history', siteId, days],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/production/history?days=${days}`,
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

