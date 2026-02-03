import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ForecastChart from './charts/ForecastChartSimple';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface ForecastComparisonPanelProps {
  siteId: string;
  horizon?: number;
}

const ForecastComparisonPanel: React.FC<ForecastComparisonPanelProps> = ({
  siteId,
  horizon = 24,
}) => {
  const [comparisonType, setComparisonType] = useState<'historical' | 'sites'>('historical');
  const [historicalDays, setHistoricalDays] = useState(7);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);

  // Get current forecast
  const { isLoading: currentLoading } = useQuery({
    queryKey: ['forecast', siteId, horizon],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast?horizon=${horizon}h`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
  });

  // Get available sites for comparison
  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(`${API_URL}/v1/sites`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    },
  });

  // Get historical forecast (same period last week/month)
  const { data: historicalForecast } = useQuery({
    queryKey: ['historical_forecast', siteId, historicalDays],
    queryFn: async () => {
      // For now, we'll use actual production data from historical period
      // In a real implementation, you'd store historical forecasts
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/production/history?days=${historicalDays}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
    enabled: comparisonType === 'historical',
  });

  if (currentLoading) {
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

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Forecast Comparison
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant={comparisonType === 'historical' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setComparisonType('historical')}
            >
              Historical
            </Button>
            <Button
              variant={comparisonType === 'sites' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setComparisonType('sites')}
            >
              Sites
            </Button>
          </Box>
        </Box>

        {comparisonType === 'historical' && (
          <Box>
            <FormControl size="small" sx={{ minWidth: 200, mb: 2 }}>
              <InputLabel>Compare with</InputLabel>
              <Select
                value={historicalDays}
                label="Compare with"
                onChange={(e) => setHistoricalDays(e.target.value as number)}
              >
                <MenuItem value={7}>Last Week</MenuItem>
                <MenuItem value={30}>Last Month</MenuItem>
                <MenuItem value={365}>Last Year</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Current Forecast vs Historical Production ({historicalDays} days ago)
              </Typography>
              <ForecastChart siteId={siteId} horizon={horizon} showConfidence={true} />
              {historicalForecast && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Historical comparison shows actual production from {historicalDays} days ago.
                  This helps identify seasonal patterns and forecast accuracy trends.
                </Alert>
              )}
            </Box>
          </Box>
        )}

        {comparisonType === 'sites' && (
          <Box>
            <FormControl size="small" sx={{ minWidth: 200, mb: 2 }}>
              <InputLabel>Select Sites</InputLabel>
              <Select
                multiple
                value={selectedSiteIds}
                label="Select Sites"
                onChange={(e) => setSelectedSiteIds(e.target.value as string[])}
                renderValue={(selected) => `${selected.length} site(s) selected`}
              >
                {sites?.map((site: any) => (
                  <MenuItem key={site.id} value={site.id}>
                    {site.name} ({site.type})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedSiteIds.length > 0 ? (
              <Grid container spacing={2}>
                {selectedSiteIds.map((compareSiteId) => (
                  <Grid item xs={12} key={compareSiteId}>
                    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        {sites?.find((s: any) => s.id === compareSiteId)?.name || compareSiteId}
                      </Typography>
                      <ForecastChart siteId={compareSiteId} horizon={horizon} showConfidence={true} />
                    </Box>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Alert severity="info">
                Select one or more sites to compare forecasts side-by-side.
              </Alert>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default ForecastComparisonPanel;

