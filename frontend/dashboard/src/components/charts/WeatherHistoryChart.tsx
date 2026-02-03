import React, { useRef, useEffect } from 'react';
import { Box, Paper, Typography, CircularProgress, Tabs, Tab } from '@mui/material';
import { useWeatherHistory } from '../../hooks/useWeatherHistory';
import Plotly from 'plotly.js';

interface WeatherHistoryChartProps {
  siteId: string;
  days?: number;
}

const WeatherHistoryChart: React.FC<WeatherHistoryChartProps> = ({
  siteId,
  days = 7,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { data: weatherHistory, isLoading, error } = useWeatherHistory(siteId, days);
  const [tabValue, setTabValue] = React.useState(0);

  useEffect(() => {
    if (!chartRef.current || !weatherHistory || isLoading || weatherHistory.data.length === 0) return;

    try {
      const timestamps = weatherHistory.data.map((d) => new Date(d.timestamp));
      
      let traces: any[] = [];
      let yAxisTitle = '';
      let chartTitle = '';

      switch (tabValue) {
        case 0: // Solar Irradiance
          chartTitle = 'Solar Irradiance (W/m²)';
          yAxisTitle = 'Irradiance (W/m²)';
          if (weatherHistory.data.some(d => d.ghi !== null)) {
            traces.push({
              x: timestamps,
              y: weatherHistory.data.map(d => d.ghi || 0),
              name: 'GHI (Global Horizontal)',
              type: 'scatter',
              mode: 'lines',
              line: { color: '#FF9800', width: 2 },
            });
          }
          if (weatherHistory.data.some(d => d.dni !== null)) {
            traces.push({
              x: timestamps,
              y: weatherHistory.data.map(d => d.dni || 0),
              name: 'DNI (Direct Normal)',
              type: 'scatter',
              mode: 'lines',
              line: { color: '#F57C00', width: 2 },
            });
          }
          if (weatherHistory.data.some(d => d.dhi !== null)) {
            traces.push({
              x: timestamps,
              y: weatherHistory.data.map(d => d.dhi || 0),
              name: 'DHI (Diffuse Horizontal)',
              type: 'scatter',
              mode: 'lines',
              line: { color: '#FFB74D', width: 2 },
            });
          }
          break;
        
        case 1: // Temperature
          chartTitle = 'Temperature (°C)';
          yAxisTitle = 'Temperature (°C)';
          if (weatherHistory.data.some(d => d.temperature !== null)) {
            traces.push({
              x: timestamps,
              y: weatherHistory.data.map(d => d.temperature || 0),
              name: 'Ambient Temperature',
              type: 'scatter',
              mode: 'lines',
              line: { color: '#2196F3', width: 2 },
            });
          }
          if (weatherHistory.data.some(d => d.panel_temp !== null)) {
            traces.push({
              x: timestamps,
              y: weatherHistory.data.map(d => d.panel_temp || 0),
              name: 'Panel Temperature',
              type: 'scatter',
              mode: 'lines',
              line: { color: '#F44336', width: 2 },
            });
          }
          break;
        
        case 2: // Wind
          chartTitle = 'Wind Conditions';
          yAxisTitle = 'Wind Speed (m/s)';
          if (weatherHistory.data.some(d => d.wind_speed !== null)) {
            traces.push({
              x: timestamps,
              y: weatherHistory.data.map(d => d.wind_speed || 0),
              name: 'Wind Speed',
              type: 'scatter',
              mode: 'lines',
              line: { color: '#9C27B0', width: 2 },
            });
          }
          break;
        
        case 3: // Cloud Cover & Humidity
          chartTitle = 'Cloud Cover & Humidity';
          yAxisTitle = 'Percentage (%)';
          if (weatherHistory.data.some(d => d.cloud_cover !== null)) {
            traces.push({
              x: timestamps,
              y: weatherHistory.data.map(d => d.cloud_cover || 0),
              name: 'Cloud Cover',
              type: 'scatter',
              mode: 'lines',
              line: { color: '#607D8B', width: 2 },
            });
          }
          if (weatherHistory.data.some(d => d.humidity !== null)) {
            traces.push({
              x: timestamps,
              y: weatherHistory.data.map(d => d.humidity || 0),
              name: 'Humidity',
              type: 'scatter',
              mode: 'lines',
              line: { color: '#00BCD4', width: 2 },
              yaxis: 'y2',
            });
          }
          break;
      }

      if (traces.length === 0) {
        return; // No data to plot
      }

      const layout: any = {
        title: chartTitle,
        xaxis: {
          title: 'Time',
          type: 'date',
        },
        yaxis: {
          title: yAxisTitle,
        },
        showlegend: true,
        hovermode: 'x unified' as const,
        plot_bgcolor: '#f8f9fa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 60 },
        font: { family: 'Roboto, sans-serif', size: 12 },
      };

      if (tabValue === 3 && traces.length > 1) {
        layout.yaxis2 = {
          title: 'Humidity (%)',
          overlaying: 'y',
          side: 'right',
        };
      }

      Plotly.newPlot(chartRef.current, traces, layout, {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d'],
      });

      return () => {
        if (chartRef.current) {
          Plotly.purge(chartRef.current);
        }
      };
    } catch (err) {
      console.error('Error rendering weather chart:', err);
    }
  }, [weatherHistory, isLoading, tabValue]);

  if (isLoading) {
    return (
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading weather history...</Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography color="error">
          Error loading weather history: {error instanceof Error ? error.message : 'Unknown error'}
        </Typography>
      </Paper>
    );
  }

  if (!weatherHistory || weatherHistory.data.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography color="textSecondary">
          No weather history data available for the last {days} days
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Weather History ({days} days)
      </Typography>
      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ mb: 2 }}>
        <Tab label="Solar Irradiance" />
        <Tab label="Temperature" />
        <Tab label="Wind" />
        <Tab label="Cloud & Humidity" />
      </Tabs>
      <Box sx={{ height: 400 }}>
        <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
      </Box>
    </Paper>
  );
};

export default WeatherHistoryChart;

