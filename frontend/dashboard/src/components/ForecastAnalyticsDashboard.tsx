import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Tabs,
  Tab,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  ShowChart as ChartIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ForecastAccuracyMetrics from './ForecastAccuracyMetrics';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface ForecastAnalyticsDashboardProps {
  siteId: string;
}

const ForecastAnalyticsDashboard: React.FC<ForecastAnalyticsDashboardProps> = ({
  siteId,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [days, setDays] = useState(30);

  // Get accuracy trends
  const { data: accuracyTrends, isLoading: trendsLoading } = useQuery({
    queryKey: ['forecast_accuracy_trends', siteId, days],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast/accuracy/trends?days=${days}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
  });

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Forecast Analytics Dashboard
          </Typography>
          <Box>
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="small"
                variant={days === d ? 'contained' : 'outlined'}
                onClick={() => setDays(d)}
                sx={{ ml: 1 }}
              >
                {d}d
              </Button>
            ))}
          </Box>
        </Box>

        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
          <Tab label="Accuracy Metrics" icon={<AssessmentIcon />} iconPosition="start" />
          <Tab label="Trends" icon={<TrendingUpIcon />} iconPosition="start" />
          <Tab label="Performance" icon={<ChartIcon />} iconPosition="start" />
        </Tabs>

        {activeTab === 0 && (
          <Box>
            <ForecastAccuracyMetrics siteId={siteId} days={days} />
          </Box>
        )}

        {activeTab === 1 && (
          <Box>
            {trendsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : accuracyTrends && accuracyTrends.trends ? (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Accuracy Trends Over Time
                </Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  {accuracyTrends.trends.slice(-10).map((trend: any, index: number) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="caption" color="textSecondary">
                            {new Date(trend.date).toLocaleDateString()}
                          </Typography>
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="body2">
                              MAE: {trend.mae !== null ? `${trend.mae} kW` : 'N/A'}
                            </Typography>
                            <Typography variant="body2">
                              RMSE: {trend.rmse !== null ? `${trend.rmse} kW` : 'N/A'}
                            </Typography>
                            <Typography variant="body2">
                              MAPE: {trend.mape !== null ? `${trend.mape}%` : 'N/A'}
                            </Typography>
                            <Typography variant="body2">
                              Data Points: {trend.data_points}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ) : (
              <Alert severity="info">No trend data available</Alert>
            )}
          </Box>
        )}

        {activeTab === 2 && (
          <Box>
            <Alert severity="info">
              Performance analytics coming soon. This will include:
              <ul>
                <li>Forecast accuracy by time of day</li>
                <li>Accuracy by weather conditions</li>
                <li>Model performance breakdown</li>
                <li>Error distribution analysis</li>
              </ul>
            </Alert>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default ForecastAnalyticsDashboard;

