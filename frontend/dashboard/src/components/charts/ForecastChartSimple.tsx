import React, { useRef, useEffect } from 'react';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import { useForecastData } from '../../hooks/useForecastData';
import Plotly from 'plotly.js';

interface ForecastChartProps {
  siteId: string;
  horizon?: number;
  showConfidence?: boolean;
}

const ForecastChartSimple: React.FC<ForecastChartProps> = ({
  siteId,
  horizon = 24,
  showConfidence = true
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { data: forecast, isLoading, error } = useForecastData(siteId, horizon);
  
  useEffect(() => {
    if (!chartRef.current || !forecast || isLoading) return;
    
    try {
      // useForecastData hook already processes the data into timestamps and values arrays
      const timestamps = forecast.timestamps.map((ts: string) => new Date(ts));
      const values = forecast.values as number[];
      
      // Get confidence intervals if available
      const p10 = showConfidence && forecast.confidenceIntervals
        ? forecast.confidenceIntervals.p10
        : null;
      const p90 = showConfidence && forecast.confidenceIntervals
        ? forecast.confidenceIntervals.p90
        : null;
      
      const traces: any[] = [
        {
          x: timestamps,
          y: values,
          name: 'Forecast (P50)',
          type: 'scatter',
          mode: 'lines+markers',
          line: { color: '#2196F3', width: 2 },
          marker: { size: 4 },
        }
      ];
      
      // Add confidence intervals if available
      if (showConfidence && p10 && p90) {
        traces.push({
          x: [...timestamps, ...timestamps.slice().reverse()],
          y: [...p90, ...p10.slice().reverse()],
          fill: 'toself',
          fillcolor: 'rgba(33, 150, 243, 0.2)',
          line: { color: 'transparent' },
          name: '80% Confidence (P10-P90)',
          showlegend: true,
          type: 'scatter',
          mode: 'lines',
        });
      }
      
      const layout: any = {
        title: `${horizon}-Hour Power Forecast`,
        xaxis: {
          title: 'Time',
          type: 'date',
        },
        yaxis: {
          title: 'Power (kW)',
        },
        showlegend: true,
        hovermode: 'x unified' as const,
        plot_bgcolor: '#f8f9fa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 30, b: 50, l: 60 },
        font: { family: 'Roboto, sans-serif', size: 12 },
      };
      
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
      console.error('Error rendering chart:', err);
    }
  }, [forecast, isLoading, showConfidence, horizon]);
  
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
  
  if (!forecast) {
    return (
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography>No forecast data available</Typography>
      </Paper>
    );
  }
  
  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        {horizon}-Hour Power Forecast
      </Typography>
      <Box sx={{ mt: 2, height: 400 }}>
        <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
      </Box>
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" color="textSecondary">
          {forecast.values?.length || 0} data points
          {(forecast as any).forecast_generated && (
            <> • Generated: {new Date((forecast as any).forecast_generated).toLocaleString()}</>
          )}
        </Typography>
      </Box>
    </Paper>
  );
};

export default ForecastChartSimple;

