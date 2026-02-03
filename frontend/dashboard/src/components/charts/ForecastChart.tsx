import React, { useRef, useEffect } from 'react';
import Plotly from 'plotly.js';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import { useForecastData } from '../../hooks/useForecastData';

interface ForecastChartProps {
  siteId: string;
  horizon?: number;
  showConfidence?: boolean;
}

const ForecastChart: React.FC<ForecastChartProps> = ({
  siteId,
  horizon = 24,
  showConfidence = true
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { data: forecast, isLoading, error } = useForecastData(siteId, horizon);
  
  useEffect(() => {
    if (!chartRef.current || !forecast || isLoading) return;
    
      const layout: any = {
        title: `${forecast.siteName || 'Site'} - ${horizon} Hour Forecast`,
        xaxis: {
          title: 'Time',
          type: 'date' as const,
        },
      yaxis: {
        title: 'Power (kW)',
        range: forecast.capacity ? [0, forecast.capacity * 1.1] : undefined,
      },
      showlegend: true,
      hovermode: 'x unified' as const,
      plot_bgcolor: '#f8f9fa',
      paper_bgcolor: '#ffffff',
      margin: { t: 40, r: 30, b: 50, l: 60 },
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
      x: forecast.timestamps,
      y: forecast.values,
      name: 'Forecast',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#2196F3', width: 3 },
    });
    
    // Confidence intervals
    if (showConfidence && forecast.confidenceIntervals) {
      traces.push({
        x: [...forecast.timestamps, ...forecast.timestamps.slice().reverse()],
        y: [
          ...forecast.confidenceIntervals.p90,
          ...forecast.confidenceIntervals.p10.slice().reverse()
        ],
        fill: 'toself',
        fillcolor: 'rgba(33, 150, 243, 0.2)',
        line: { color: 'transparent' },
        name: '80% Confidence',
        showlegend: true,
      });
    }
    
    Plotly.newPlot(chartRef.current, traces, layout, {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
    });
    
    return () => {
      if (chartRef.current) {
        Plotly.purge(chartRef.current);
      }
    };
  }, [forecast, horizon, showConfidence, isLoading]);
  
  if (isLoading) {
    return (
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading forecast...</Typography>
      </Paper>
    );
  }
  
  if (error) {
    return (
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography color="error">Error loading forecast: {error.message}</Typography>
      </Paper>
    );
  }
  
  return (
    <Paper elevation={2} sx={{ p: 2, height: '500px' }}>
      <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
    </Paper>
  );
};

export default ForecastChart;

