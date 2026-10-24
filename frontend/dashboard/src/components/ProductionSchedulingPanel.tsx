import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Build as BuildIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import KpiStrip from './ui/KpiStrip';
import { formatPlanningTime } from '../utils/formatPlanningTime';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface ProductionSchedulingPanelProps {
  siteId: string;
  horizon?: string;
  compact?: boolean;
}

interface SchedulingData {
  site_id: string;
  horizon: string;
  capacity_kw: number;
  average_power_kw: number;
  recommendations: Array<{
    type: string;
    priority: string;
    title: string;
    description: string;
    action: string;
    impact: string;
  }>;
  peak_periods: Array<{
    timestamp: string;
    power_kw: number;
    capacity_factor: number;
  }>;
  maintenance_windows: Array<{
    timestamp: string;
    power_kw: number;
    capacity_factor: number;
  }>;
  forecast_summary: {
    max_power_kw: number;
    min_power_kw: number;
    total_energy_kwh: number;
  };
}

const ProductionSchedulingPanel: React.FC<ProductionSchedulingPanelProps> = ({
  siteId,
  horizon = '24h',
  compact = false,
}) => {
  const { data: scheduling, isLoading, error } = useQuery<SchedulingData>({
    queryKey: ['forecast_scheduling', siteId, horizon],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast/scheduling?horizon=${horizon}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    },
    enabled: !!siteId,
  });

  const priorityColor = (priority: string) => {
    if (priority === 'high') return 'error';
    if (priority === 'medium') return 'warning';
    if (priority === 'low') return 'info';
    return 'default';
  };

  const recIcon = (type: string) => {
    if (type === 'peak_production') return <TrendingUpIcon fontSize="small" color="success" />;
    if (type === 'maintenance') return <BuildIcon fontSize="small" color="warning" />;
    if (type === 'variability') return <WarningIcon fontSize="small" color="warning" />;
    return <CheckCircleIcon fontSize="small" color="action" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">
            Could not load scheduling:{' '}
            {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!scheduling) return null;

  const summary = scheduling.forecast_summary;
  const peakCf =
    scheduling.peak_periods[0]?.capacity_factor ??
    (scheduling.capacity_kw > 0
      ? (summary.max_power_kw / scheduling.capacity_kw) * 100
      : 0);

  return (
    <Card>
      <CardContent sx={{ '&:last-child': { pb: compact ? 2 : 3 } }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: compact ? 1.5 : 2 }}
          flexWrap="wrap"
          useFlexGap
          spacing={1}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Dispatch
          </Typography>
          <Chip label={horizon} size="small" color="primary" variant="outlined" />
        </Stack>

        <KpiStrip
          dense={compact}
          items={[
            {
              label: 'Average',
              value: `${scheduling.average_power_kw.toFixed(0)} kW`,
            },
            {
              label: 'Peak',
              value: `${summary.max_power_kw.toFixed(0)} kW`,
              hint: `${peakCf.toFixed(1)}% nameplate`,
              tone: 'renewable',
            },
            {
              label: 'Energy',
              value: `${summary.total_energy_kwh.toFixed(0)} kWh`,
            },
            {
              label: 'Floor',
              value: `${summary.min_power_kw.toFixed(0)} kW`,
              hint: 'Includes night idle',
            },
          ]}
        />

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Actions
            </Typography>
            {scheduling.recommendations.length === 0 ? (
              <Alert severity="info">No dispatch actions for this horizon.</Alert>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={0}>
                {scheduling.recommendations.map((rec, index) => (
                  <Stack
                    key={`${rec.type}-${index}`}
                    direction="row"
                    spacing={1.5}
                    alignItems="flex-start"
                    sx={{ py: 1.25 }}
                  >
                    <Box sx={{ mt: 0.25 }}>{recIcon(rec.type)}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="body2" fontWeight={600}>
                          {rec.title}
                        </Typography>
                        <Chip
                          label={rec.priority}
                          size="small"
                          color={priorityColor(rec.priority) as any}
                          sx={{ height: 22 }}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {rec.action}
                      </Typography>
                      {!compact && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {rec.description}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                ))}
              </Stack>
            )}
          </Grid>

          <Grid item xs={12} md={6}>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Peak hours
            </Typography>
            {scheduling.peak_periods.length === 0 ? (
              <Alert severity="info">No daytime peaks in this horizon.</Alert>
            ) : (
              <Stack spacing={0.75} sx={{ mb: 2 }}>
                {scheduling.peak_periods.map((period, index) => (
                  <Stack
                    key={`peak-${index}`}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      px: 1.25,
                      py: 0.75,
                      bgcolor: 'rgba(13, 148, 136, 0.08)',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2">{formatPlanningTime(period.timestamp)}</Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {period.power_kw.toFixed(0)} kW
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                        {period.capacity_factor.toFixed(1)}%
                      </Typography>
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}

            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Daytime troughs
            </Typography>
            {scheduling.maintenance_windows.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                No soft daytime troughs (overnight zeros excluded).
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {scheduling.maintenance_windows.map((window, index) => (
                  <Stack
                    key={`trough-${index}`}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      px: 1.25,
                      py: 0.75,
                      bgcolor: 'rgba(217, 119, 6, 0.08)',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2">{formatPlanningTime(window.timestamp)}</Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {window.power_kw.toFixed(0)} kW
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                        {window.capacity_factor.toFixed(1)}%
                      </Typography>
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default ProductionSchedulingPanel;
