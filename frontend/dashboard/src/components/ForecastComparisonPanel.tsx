import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Grid,
  Stack,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ForecastChart from './charts/ForecastChartSimple';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface ForecastComparisonPanelProps {
  siteId: string;
  horizon?: number;
  compact?: boolean;
}

const ForecastComparisonPanel: React.FC<ForecastComparisonPanelProps> = ({
  siteId,
  horizon = 24,
  compact = false,
}) => {
  const [comparisonType, setComparisonType] = useState<'historical' | 'sites'>('historical');
  const [historicalDays, setHistoricalDays] = useState(7);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);

  const { isLoading: currentLoading } = useQuery({
    queryKey: ['forecast', siteId, horizon],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast?horizon=${horizon}h`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    },
  });

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const response = await axios.get(`${API_URL}/v1/sites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
    enabled: comparisonType === 'sites',
  });

  const { data: historicalForecast } = useQuery({
    queryKey: ['historical_forecast', siteId, historicalDays],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/production/history?days=${historicalDays}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    },
    enabled: comparisonType === 'historical',
  });

  if (currentLoading) {
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

  return (
    <Card>
      <CardContent sx={{ '&:last-child': { pb: compact ? 2 : 3 } }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          spacing={1}
          sx={{ mb: 1.5 }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Compare
          </Typography>
          <Stack direction="row" spacing={1}>
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
          </Stack>
        </Stack>

        {comparisonType === 'historical' && (
          <Box>
            <FormControl size="small" sx={{ minWidth: 180, mb: 1.5 }}>
              <InputLabel>Lookback</InputLabel>
              <Select
                value={historicalDays}
                label="Lookback"
                onChange={(e) => setHistoricalDays(e.target.value as number)}
              >
                <MenuItem value={7}>7 days</MenuItem>
                <MenuItem value={30}>30 days</MenuItem>
                <MenuItem value={365}>365 days</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Current {horizon}h forecast vs production from {historicalDays} days ago
              {historicalForecast ? '' : ' (history pending)'}.
            </Typography>
            <ForecastChart siteId={siteId} horizon={horizon} showConfidence={true} />
          </Box>
        )}

        {comparisonType === 'sites' && (
          <Box>
            <FormControl size="small" sx={{ minWidth: 220, mb: 1.5 }}>
              <InputLabel>Sites</InputLabel>
              <Select
                multiple
                value={selectedSiteIds}
                label="Sites"
                onChange={(e) => setSelectedSiteIds(e.target.value as string[])}
                renderValue={(selected) => `${selected.length} selected`}
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
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                      {sites?.find((s: any) => s.id === compareSiteId)?.name || compareSiteId}
                    </Typography>
                    <ForecastChart siteId={compareSiteId} horizon={horizon} showConfidence={true} />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Alert severity="info">Select sites to compare side-by-side.</Alert>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default ForecastComparisonPanel;
