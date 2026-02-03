import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { useForecastData } from '../../hooks/useForecastData';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface ForecastChartWithWeatherProps {
  siteId: string;
  horizon?: number;
  showConfidence?: boolean;
}

interface WeatherForecastPoint {
  timestamp: string;
  temperature: number | null;
  cloud_cover: number | null;
  precipitation: number | null;
  wind_speed: number | null;
  weather_icon: string | null;
  ghi_estimated: number | null;
}

const ForecastChartWithWeather: React.FC<ForecastChartWithWeatherProps> = ({
  siteId,
  horizon = 24,
  showConfidence = true,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { data: forecast, isLoading: forecastLoading } = useForecastData(siteId, horizon);
  
  const { data: weatherForecast, isLoading: weatherLoading } = useQuery<{
    site_id: string;
    forecast_hours: number;
    data_points: number;
    forecast: WeatherForecastPoint[];
  }>({
    queryKey: ['weather_forecast', siteId, horizon],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/weather/forecast?hours=${horizon}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
    enabled: !!siteId,
  });

  useEffect(() => {
    if (!chartRef.current || !forecast || forecastLoading || weatherLoading) return;

    // Import Plotly dynamically
    import('plotly.js').then((Plotly) => {
      const timestamps = forecast.timestamps.map((ts: string) => new Date(ts));
      const values = forecast.values as number[];

      const layout: any = {
        title: `${forecast.siteName || 'Site'} - ${horizon} Hour Forecast with Weather`,
        xaxis: {
          title: 'Time',
          type: 'date' as const,
        },
        yaxis: {
          title: 'Power (kW)',
          side: 'left' as const,
          range: forecast.capacity ? [0, forecast.capacity * 1.1] : undefined,
        },
        yaxis2: {
          title: 'Temperature (°C) / Cloud Cover (%)',
          side: 'right' as const,
          overlaying: 'y' as const,
        },
        showlegend: true,
        hovermode: 'x unified' as const,
        plot_bgcolor: '#f8f9fa',
        paper_bgcolor: '#ffffff',
        margin: { t: 40, r: 80, b: 50, l: 60 },
        font: { family: 'Roboto, sans-serif' },
      };

      const traces: any[] = [];

      // Actual production trace
      if (forecast.actuals) {
        traces.push({
          x: forecast.actuals.timestamps,
          y: forecast.actuals.values,
          name: 'Actual Production',
          type: 'scatter',
          mode: 'lines',
          line: { color: '#4CAF50', width: 2 },
        });
      }

      // Forecast trace
      traces.push({
        x: timestamps,
        y: values,
        name: 'Forecast',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#2196F3', width: 3 },
      });

      // Confidence intervals
      if (showConfidence && forecast.confidenceIntervals) {
        traces.push({
          x: [...timestamps, ...timestamps.slice().reverse()],
          y: [
            ...forecast.confidenceIntervals.p90,
            ...forecast.confidenceIntervals.p10.slice().reverse(),
          ],
          fill: 'toself',
          fillcolor: 'rgba(33, 150, 243, 0.2)',
          line: { color: 'transparent' },
          name: '80% Confidence',
          showlegend: true,
        });
      }

      // Weather overlay - Temperature
      if (weatherForecast && weatherForecast.forecast) {
        const weatherTimestamps = weatherForecast.forecast.map((w) => new Date(w.timestamp));
        const temperatures = weatherForecast.forecast.map((w) => w.temperature);

        traces.push({
          x: weatherTimestamps,
          y: temperatures,
          name: 'Temperature',
          type: 'scatter',
          mode: 'lines',
          line: { color: '#FF9800', width: 2, dash: 'dash' },
          yaxis: 'y2',
          showlegend: true,
        });

        // Cloud cover as background
        const cloudCovers = weatherForecast.forecast.map((w) => w.cloud_cover || 0);
        traces.push({
          x: weatherTimestamps,
          y: cloudCovers,
          name: 'Cloud Cover (%)',
          type: 'scatter',
          mode: 'lines',
          fill: 'tozeroy',
          fillcolor: 'rgba(128, 128, 128, 0.1)',
          line: { color: '#757575', width: 1 },
          yaxis: 'y2',
          showlegend: true,
        });
      }

      if (chartRef.current) {
        Plotly.default.newPlot(chartRef.current, traces, layout, {
          responsive: true,
          displayModeBar: true,
        });
      }
    });
  }, [forecast, weatherForecast, forecastLoading, weatherLoading, horizon, showConfidence]);

  if (forecastLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!forecast) {
    return (
      <Alert severity="error">Error loading forecast data</Alert>
    );
  }

  return (
    <Box>
      <div ref={chartRef} style={{ width: '100%', height: '500px' }} />
    </Box>
  );
};

export default ForecastChartWithWeather;

