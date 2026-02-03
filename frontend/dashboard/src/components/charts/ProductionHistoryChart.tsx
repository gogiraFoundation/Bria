import React, { useRef, useEffect } from 'react';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import { useProductionHistory } from '../../hooks/useProductionHistory';
import Plotly from 'plotly.js';

interface ProductionHistoryChartProps {
  siteId: string;
  days?: number;
}

const ProductionHistoryChart: React.FC<ProductionHistoryChartProps> = ({
  siteId,
  days = 7,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { data: productionHistory, isLoading, error } = useProductionHistory(siteId, days);

  useEffect(() => {
    if (!chartRef.current || !productionHistory || isLoading || productionHistory.data.length === 0) return;

    try {
      const timestamps = productionHistory.data.map((d) => new Date(d.timestamp));
      const powerValues = productionHistory.data.map((d) => d.power_kw || 0);
      const energyValues = productionHistory.data.map((d) => d.energy_kwh || 0);

      const traces: any[] = [
        {
          x: timestamps,
          y: powerValues,
          name: 'Power (kW)',
          type: 'scatter',
          mode: 'lines+markers',
          line: { color: '#4CAF50', width: 2 },
          marker: { size: 4 },
          yaxis: 'y',
        },
        {
          x: timestamps,
          y: energyValues,
          name: 'Energy (kWh)',
          type: 'scatter',
          mode: 'lines',
          line: { color: '#2196F3', width: 2 },
          yaxis: 'y2',
        },
      ];

      const layout: any = {
        title: `Production History (${days} days)`,
        xaxis: {
          title: 'Time',
          type: 'date',
        },
        yaxis: {
          title: 'Power (kW)',
          side: 'left',
        },
        yaxis2: {
          title: 'Energy (kWh)',
          overlaying: 'y',
          side: 'right',
        },
        showlegend: true,
        hovermode: 'x unified' as const,
        plot_bgcolor: '#f8f9fa',
        paper_bgcolor: '#ffffff',
        margin: { t: 50, r: 80, b: 50, l: 60 },
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
      console.error('Error rendering production chart:', err);
    }
  }, [productionHistory, isLoading, days]);

  if (isLoading) {
    return (
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading production history...</Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography color="error">
          Error loading production history: {error instanceof Error ? error.message : 'Unknown error'}
        </Typography>
      </Paper>
    );
  }

  if (!productionHistory || productionHistory.data.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography color="textSecondary">
          No production history data available for the last {days} days
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Production History ({days} days)
      </Typography>
      <Box sx={{ height: 400 }}>
        <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
      </Box>
    </Paper>
  );
};

export default ProductionHistoryChart;

