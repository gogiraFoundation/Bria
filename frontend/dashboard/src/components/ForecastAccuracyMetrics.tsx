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
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assessment as AssessmentIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface ForecastAccuracyMetricsProps {
  siteId: string;
  days?: number;
  horizon?: string;
}

interface AccuracyData {
  site_id: string;
  period_days: number;
  horizon?: string;
  data_points: number;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  bias: number | null;
  accuracy_score: number | null;
  recent_7d: {
    mae: number | null;
    rmse: number | null;
    mape: number | null;
  };
  accuracy_trend: string;
}

const ForecastAccuracyMetrics: React.FC<ForecastAccuracyMetricsProps> = ({
  siteId,
  days = 30,
  horizon,
}) => {
  const { data: accuracy, isLoading, error } = useQuery<AccuracyData>({
    queryKey: ['forecast_accuracy', siteId, days, horizon],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const params = new URLSearchParams({ days: days.toString() });
      if (horizon) {
        params.append('horizon', horizon);
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast/accuracy?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  const getAccuracyColor = (score: number | null): string => {
    if (score === null) return 'default';
    if (score >= 80) return 'success';
    if (score >= 60) return 'info';
    if (score >= 40) return 'warning';
    return 'error';
  };

  const getAccuracyLabel = (score: number | null): string => {
    if (score === null) return 'N/A';
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUpIcon color="success" />;
      case 'degrading':
        return <TrendingDownIcon color="error" />;
      default:
        return <CheckCircleIcon color="info" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
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
            Error loading forecast accuracy metrics: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!accuracy || accuracy.data_points === 0) {
    return (
      <Card
        elevation={2}
        sx={{
          borderRadius: 2,
          height: '100%',
          transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: 4,
          },
        }}
      >
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
            Forecast Accuracy Metrics
          </Typography>
          <Alert 
            severity="info"
            sx={{
              borderRadius: 2,
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.8 },
              },
            }}
          >
            No accuracy data available. Accuracy metrics will appear once forecast vs actual comparisons are available.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      elevation={2}
      sx={{
        borderRadius: 2,
        height: '100%',
        transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Forecast Accuracy Metrics
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {getTrendIcon(accuracy.accuracy_trend)}
            <Chip
              label={getAccuracyLabel(accuracy.accuracy_score)}
              color={getAccuracyColor(accuracy.accuracy_score) as any}
              size="small"
            />
          </Box>
        </Box>

        {/* Accuracy Score Gauge */}
        {accuracy.accuracy_score !== null && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="textSecondary">
                Overall Accuracy Score
              </Typography>
              <Typography variant="h6" color={getAccuracyColor(accuracy.accuracy_score) + '.main'}>
                {accuracy.accuracy_score.toFixed(1)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={accuracy.accuracy_score}
              sx={{
                height: 10,
                borderRadius: 5,
                backgroundColor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getAccuracyColor(accuracy.accuracy_score) + '.main',
                },
              }}
            />
          </Box>
        )}

        <Grid container spacing={2}>
          {/* MAE */}
          <Grid item xs={12} sm={6} md={3}>
            <Box 
              sx={{ 
                textAlign: 'center', 
                p: 2.5, 
                bgcolor: 'primary.light', 
                borderRadius: 2,
                transition: 'all 0.3s ease',
                '&:hover': {
                  bgcolor: 'primary.main',
                  transform: 'scale(1.05)',
                  '& .MuiTypography-root': {
                    color: 'white',
                  },
                  '& .MuiSvgIcon-root': {
                    color: 'white',
                  },
                },
              }}
            >
              <AssessmentIcon 
                sx={{ 
                  fontSize: 40, 
                  color: 'primary.main', 
                  mb: 1,
                  transition: 'transform 0.3s ease',
                  '&:hover': {
                    transform: 'rotate(5deg) scale(1.1)',
                  },
                }} 
              />
              <Typography variant="h5" color="primary.main" sx={{ fontWeight: 600, transition: 'color 0.3s ease' }}>
                {accuracy.mae !== null ? `${accuracy.mae.toFixed(1)} kW` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                MAE (Mean Absolute Error)
              </Typography>
              {accuracy.recent_7d.mae !== null && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                  Recent: {accuracy.recent_7d.mae.toFixed(1)} kW
                </Typography>
              )}
            </Box>
          </Grid>

          {/* RMSE */}
          <Grid item xs={12} sm={6} md={3}>
            <Box 
              sx={{ 
                textAlign: 'center', 
                p: 2.5, 
                bgcolor: 'info.light', 
                borderRadius: 2,
                transition: 'all 0.3s ease',
                '&:hover': {
                  bgcolor: 'info.main',
                  transform: 'scale(1.05)',
                  '& .MuiTypography-root': {
                    color: 'white',
                  },
                  '& .MuiSvgIcon-root': {
                    color: 'white',
                  },
                },
              }}
            >
              <AssessmentIcon 
                sx={{ 
                  fontSize: 40, 
                  color: 'info.main', 
                  mb: 1,
                  transition: 'transform 0.3s ease',
                  '&:hover': {
                    transform: 'rotate(5deg) scale(1.1)',
                  },
                }} 
              />
              <Typography variant="h5" color="info.main" sx={{ fontWeight: 600, transition: 'color 0.3s ease' }}>
                {accuracy.rmse !== null ? `${accuracy.rmse.toFixed(1)} kW` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                RMSE (Root Mean Square Error)
              </Typography>
              {accuracy.recent_7d.rmse !== null && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                  Recent: {accuracy.recent_7d.rmse.toFixed(1)} kW
                </Typography>
              )}
            </Box>
          </Grid>

          {/* MAPE */}
          <Grid item xs={12} sm={6} md={3}>
            <Box 
              sx={{ 
                textAlign: 'center', 
                p: 2.5, 
                bgcolor: 'warning.light', 
                borderRadius: 2,
                transition: 'all 0.3s ease',
                '&:hover': {
                  bgcolor: 'warning.main',
                  transform: 'scale(1.05)',
                  '& .MuiTypography-root': {
                    color: 'white',
                  },
                  '& .MuiSvgIcon-root': {
                    color: 'white',
                  },
                },
              }}
            >
              <AssessmentIcon 
                sx={{ 
                  fontSize: 40, 
                  color: 'warning.main', 
                  mb: 1,
                  transition: 'transform 0.3s ease',
                  '&:hover': {
                    transform: 'rotate(5deg) scale(1.1)',
                  },
                }} 
              />
              <Typography variant="h5" color="warning.main" sx={{ fontWeight: 600, transition: 'color 0.3s ease' }}>
                {accuracy.mape !== null ? `${accuracy.mape.toFixed(1)}%` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                MAPE (Mean Absolute % Error)
              </Typography>
              {accuracy.recent_7d.mape !== null && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                  Recent: {accuracy.recent_7d.mape.toFixed(1)}%
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Bias */}
          <Grid item xs={12} sm={6} md={3}>
            <Box 
              sx={{ 
                textAlign: 'center', 
                p: 2.5, 
                bgcolor: 'secondary.light', 
                borderRadius: 2,
                transition: 'all 0.3s ease',
                '&:hover': {
                  bgcolor: 'secondary.main',
                  transform: 'scale(1.05)',
                  '& .MuiTypography-root': {
                    color: 'white',
                  },
                  '& .MuiSvgIcon-root': {
                    color: 'white',
                  },
                },
              }}
            >
              <AssessmentIcon 
                sx={{ 
                  fontSize: 40, 
                  color: 'secondary.main', 
                  mb: 1,
                  transition: 'transform 0.3s ease',
                  '&:hover': {
                    transform: 'rotate(5deg) scale(1.1)',
                  },
                }} 
              />
              <Typography variant="h5" color="secondary.main" sx={{ fontWeight: 600, transition: 'color 0.3s ease' }}>
                {accuracy.bias !== null ? `${accuracy.bias > 0 ? '+' : ''}${accuracy.bias.toFixed(1)} kW` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                Bias (Over/Under Forecast)
              </Typography>
              {accuracy.bias !== null && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                  {accuracy.bias > 0 ? 'Over-forecasting' : accuracy.bias < 0 ? 'Under-forecasting' : 'Neutral'}
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>

        {/* Data Points Info */}
        <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="caption" color="textSecondary">
            Based on {accuracy.data_points} data points over {accuracy.period_days} days
            {horizon && ` (${horizon} horizon)`}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ForecastAccuracyMetrics;

