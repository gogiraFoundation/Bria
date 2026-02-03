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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Build as BuildIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface ProductionSchedulingPanelProps {
  siteId: string;
  horizon?: string;
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
}) => {
  const { data: scheduling, isLoading, error } = useQuery<SchedulingData>({
    queryKey: ['forecast_scheduling', siteId, horizon],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast/scheduling?horizon=${horizon}`,
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

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'default';
    }
  };

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'peak_production':
        return <TrendingUpIcon />;
      case 'maintenance':
        return <BuildIcon />;
      case 'variability':
        return <WarningIcon />;
      default:
        return <CheckCircleIcon />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
            <CircularProgress />
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
            Error loading scheduling recommendations: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!scheduling) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Production Scheduling & Optimization
          </Typography>
          <Chip
            label={`${horizon} Horizon`}
            size="small"
            color="primary"
          />
        </Box>

        {/* Forecast Summary */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Forecast Summary
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="body2" color="textSecondary">Average Power</Typography>
              <Typography variant="h6">{scheduling.average_power_kw.toFixed(1)} kW</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="body2" color="textSecondary">Max Power</Typography>
              <Typography variant="h6">{scheduling.forecast_summary.max_power_kw.toFixed(1)} kW</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="body2" color="textSecondary">Min Power</Typography>
              <Typography variant="h6">{scheduling.forecast_summary.min_power_kw.toFixed(1)} kW</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="body2" color="textSecondary">Total Energy</Typography>
              <Typography variant="h6">{scheduling.forecast_summary.total_energy_kwh.toFixed(0)} kWh</Typography>
            </Grid>
          </Grid>
        </Box>

        <Grid container spacing={2}>
          {/* Recommendations */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              Recommendations
            </Typography>
            {scheduling.recommendations.length > 0 ? (
              <List>
                {scheduling.recommendations.map((rec, index) => (
                  <React.Fragment key={index}>
                    <ListItem>
                      <ListItemIcon>
                        {getRecommendationIcon(rec.type)}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {rec.title}
                            <Chip
                              label={rec.priority}
                              size="small"
                              color={getPriorityColor(rec.priority) as any}
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                              {rec.description}
                            </Typography>
                            <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                              <strong>Action:</strong> {rec.action}
                            </Typography>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                              <strong>Impact:</strong> {rec.impact}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < scheduling.recommendations.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            ) : (
              <Alert severity="info">No specific recommendations at this time</Alert>
            )}
          </Grid>

          {/* Peak Periods & Maintenance Windows */}
          <Grid item xs={12} md={6}>
            <Grid container spacing={2}>
              {/* Peak Production Periods */}
              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom>
                  <ScheduleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Peak Production Periods
                </Typography>
                {scheduling.peak_periods.length > 0 ? (
                  <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                    {scheduling.peak_periods.map((period, index) => (
                      <Box
                        key={index}
                        sx={{
                          p: 1,
                          mb: 1,
                          bgcolor: 'success.light',
                          borderRadius: 1,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="body2">
                            {new Date(period.timestamp).toLocaleString()}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {period.power_kw.toFixed(1)} kW ({period.capacity_factor.toFixed(1)}% capacity)
                          </Typography>
                        </Box>
                        <TrendingUpIcon color="success" />
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Alert severity="info" sx={{ mt: 1 }}>No peak periods identified</Alert>
                )}
              </Grid>

              {/* Maintenance Windows */}
              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom>
                  <BuildIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Optimal Maintenance Windows
                </Typography>
                {scheduling.maintenance_windows.length > 0 ? (
                  <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                    {scheduling.maintenance_windows.map((window, index) => (
                      <Box
                        key={index}
                        sx={{
                          p: 1,
                          mb: 1,
                          bgcolor: 'warning.light',
                          borderRadius: 1,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="body2">
                            {new Date(window.timestamp).toLocaleString()}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {window.power_kw.toFixed(1)} kW ({window.capacity_factor.toFixed(1)}% capacity)
                          </Typography>
                        </Box>
                        <BuildIcon color="warning" />
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Alert severity="info" sx={{ mt: 1 }}>No maintenance windows identified</Alert>
                )}
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default ProductionSchedulingPanel;

