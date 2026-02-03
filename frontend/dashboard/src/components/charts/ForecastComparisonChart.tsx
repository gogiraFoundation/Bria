import React, { useRef, useEffect, useMemo } from 'react';
import Plotly from 'plotly.js';
import { Paper, Typography, CircularProgress, Alert } from '@mui/material';
import { useForecastData } from '../../hooks/useForecastData';

interface ForecastComparisonChartProps {
  siteIds: string[];
  horizon?: number;
  showConfidence?: boolean;
}

const ForecastComparisonChart: React.FC<ForecastComparisonChartProps> = ({
  siteIds,
  horizon = 24,
  showConfidence = true
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  
  // Fetch forecasts for all sites
  // Note: We must call hooks unconditionally, so we always call them but only use data for valid siteIds
  // Use a placeholder ID for unused slots to maintain hook order
  const placeholderId = 'placeholder';
  const maxSites = 8;
  
  const forecast1 = useForecastData(siteIds.length > 0 ? siteIds[0] : placeholderId, horizon, siteIds.length > 0);
  const forecast2 = useForecastData(siteIds.length > 1 ? siteIds[1] : placeholderId, horizon, siteIds.length > 1);
  const forecast3 = useForecastData(siteIds.length > 2 ? siteIds[2] : placeholderId, horizon, siteIds.length > 2);
  const forecast4 = useForecastData(siteIds.length > 3 ? siteIds[3] : placeholderId, horizon, siteIds.length > 3);
  const forecast5 = useForecastData(siteIds.length > 4 ? siteIds[4] : placeholderId, horizon, siteIds.length > 4);
  const forecast6 = useForecastData(siteIds.length > 5 ? siteIds[5] : placeholderId, horizon, siteIds.length > 5);
  const forecast7 = useForecastData(siteIds.length > 6 ? siteIds[6] : placeholderId, horizon, siteIds.length > 6);
  const forecast8 = useForecastData(siteIds.length > 7 ? siteIds[7] : placeholderId, horizon, siteIds.length > 7);

  const forecastQueries = [forecast1, forecast2, forecast3, forecast4, forecast5, forecast6, forecast7, forecast8].slice(0, Math.min(siteIds.length, maxSites));

  const isLoading = forecastQueries.some(f => f.isLoading);
  const hasError = forecastQueries.some(f => f.error);
  const error = forecastQueries.find(f => f.error)?.error;

  // Color palette for different sites
  const colors = useMemo(() => [
    '#2196F3', // Blue
    '#4CAF50', // Green
    '#FF9800', // Orange
    '#9C27B0', // Purple
    '#F44336', // Red
    '#00BCD4', // Cyan
    '#FFC107', // Amber
    '#795548', // Brown
  ], []);

  useEffect(() => {
    if (!chartRef.current || isLoading || hasError) return;
    
    const allForecasts = forecastQueries.map(f => f.data).filter(Boolean);
    if (allForecasts.length === 0) return;

    try {
      const traces: any[] = [];
      const siteNames: string[] = [];

      allForecasts.forEach((forecast, index) => {
        if (!forecast) return;

        const timestamps = forecast.timestamps.map((ts: string) => new Date(ts));
        const values = forecast.values as number[];
        const color = colors[index % colors.length];
        const siteName = forecast.siteName || `Site ${index + 1}`;
        siteNames.push(siteName);

        // Main forecast trace
        traces.push({
          x: timestamps,
          y: values,
          name: `${siteName} (${forecast.siteType || 'Unknown'})`,
          type: 'scatter',
          mode: 'lines+markers',
          line: { color, width: 2.5 },
          marker: { size: 4, color },
        });

        // Confidence intervals
        if (showConfidence && forecast.confidenceIntervals) {
          const p10 = forecast.confidenceIntervals.p10;
          const p90 = forecast.confidenceIntervals.p90;
          
          if (p10 && p90) {
            traces.push({
              x: [...timestamps, ...timestamps.slice().reverse()],
              y: [...p90, ...p10.slice().reverse()],
              fill: 'toself',
              fillcolor: color.replace('rgb', 'rgba').replace(')', ', 0.15)') || `${color}26`,
              line: { color: 'transparent' },
              name: `${siteName} - 80% Confidence`,
              showlegend: false,
              type: 'scatter',
              mode: 'lines',
              hoverinfo: 'skip',
            });
          }
        }
      });

      // Calculate max value for y-axis
      const allValues = allForecasts.flatMap(f => f?.values || []);
      const maxValue = Math.max(...allValues, 0);
      const maxCapacity = Math.max(...allForecasts.map(f => f?.capacity || 0), 0);

      const layout: any = {
        title: `Forecast Comparison - ${horizon} Hour${horizon !== 1 ? 's' : ''}`,
        xaxis: {
          title: 'Time',
          type: 'date',
          showgrid: true,
          gridcolor: '#e0e0e0',
        },
        yaxis: {
          title: 'Power (kW)',
          range: [0, Math.max(maxValue * 1.1, maxCapacity * 1.1)],
          showgrid: true,
          gridcolor: '#e0e0e0',
        },
        showlegend: true,
        legend: {
          x: 1.02,
          y: 1,
          xanchor: 'left',
          yanchor: 'top',
        },
        hovermode: 'x unified',
        plot_bgcolor: '#f8f9fa',
        paper_bgcolor: '#ffffff',
        margin: { t: 60, r: 150, b: 60, l: 80 },
        font: { family: 'Roboto, sans-serif', size: 12 },
      };

      Plotly.newPlot(chartRef.current, traces, layout, {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d'],
      });

      // Store ref value for cleanup
      const chartElement = chartRef.current;
      return () => {
        if (chartElement) {
          Plotly.purge(chartElement);
        }
      };
    } catch (err) {
      console.error('Error rendering comparison chart:', err);
    }
  }, [forecastQueries, horizon, showConfidence, isLoading, hasError, colors]);

  if (isLoading) {
    return (
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading forecasts for comparison...</Typography>
      </Paper>
    );
  }

  if (hasError) {
    return (
      <Paper elevation={2} sx={{ p: 2 }}>
        <Alert severity="error">
          Error loading forecasts: {error?.message || 'Unknown error'}
        </Alert>
      </Paper>
    );
  }

  if (siteIds.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="textSecondary">
          Select sites to compare forecasts
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 2, height: '600px' }}>
      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
    </Paper>
  );
};

export default ForecastComparisonChart;

