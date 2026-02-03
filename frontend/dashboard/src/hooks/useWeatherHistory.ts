import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface WeatherDataPoint {
  timestamp: string;
  ghi: number | null;
  dni: number | null;
  dhi: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  temperature: number | null;
  panel_temp: number | null;
  humidity: number | null;
  cloud_cover: number | null;
}

interface WeatherHistory {
  site_id: string;
  period_days: number;
  data: WeatherDataPoint[];
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

export const useWeatherHistory = (siteId: string, days: number = 7) => {
  return useQuery<WeatherHistory>({
    queryKey: ['weather-history', siteId, days],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/weather/history?days=${days}`,
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

