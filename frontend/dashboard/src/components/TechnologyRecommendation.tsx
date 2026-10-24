import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Divider,
  TextField,
  Stack,
  Button,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import axios from 'axios';
import SolarPowerIcon from '@mui/icons-material/SolarPower';
import AirIcon from '@mui/icons-material/Air';
import HubIcon from '@mui/icons-material/Hub';
import WarningIcon from '@mui/icons-material/Warning';
import EmptyState from './ui/EmptyState';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface TechnologyRecommendationProps {
  siteId: string;
  days?: number;
  energyPricePerMwh?: number;
  solarCapexPerMw?: number;
  windCapexPerMw?: number;
  compact?: boolean;
}

interface SolarAnalysis {
  avg_ghi_w_per_m2: number;
  max_ghi_w_per_m2: number;
  min_ghi_w_per_m2: number;
  estimated_capacity_factor_percent: number;
  annual_energy_gwh: number;
  solar_resource_class: string;
}

interface WindAnalysis {
  avg_wind_speed_m_per_s: number;
  max_wind_speed_m_per_s: number;
  min_wind_speed_m_per_s: number;
  estimated_capacity_factor_percent: number;
  annual_energy_gwh: number;
  wind_resource_class: string;
}

interface FinancialAnalysis {
  capex_usd: number;
  annual_revenue_usd: number;
  lcoe_usd_per_mwh: number;
  payback_years: number;
  npv_20yr_usd: number;
}

interface HybridAnalysis extends FinancialAnalysis {
  annual_energy_gwh: number;
}

interface Recommendation {
  recommended_technology: 'solar' | 'wind' | 'hybrid' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
}

interface TechnologyRecommendationData {
  site_id: string;
  analysis_period_days: number;
  data_points_analyzed: number;
  solar_analysis?: SolarAnalysis;
  wind_analysis?: WindAnalysis;
  hybrid_analysis?: HybridAnalysis;
  financial_analysis: {
    solar?: FinancialAnalysis;
    wind?: FinancialAnalysis;
  };
  recommendations: Recommendation;
  assumptions: {
    energy_price_per_mwh: number;
    solar_capex_per_mw: number;
    wind_capex_per_mw: number;
    solar_efficiency: number | null;
    solar_availability: number;
    discount_rate: number;
  };
  data_quality?: 'high' | 'medium' | 'low' | 'insufficient';
  model_version?: string;
  error?: string;
  message?: string;
}

const TechnologyRecommendation: React.FC<TechnologyRecommendationProps> = ({
  siteId,
  days = 365,
  energyPricePerMwh = 50,
  solarCapexPerMw = 1000000,
  windCapexPerMw = 1500000,
  compact = false,
}) => {
  const [price, setPrice] = useState(energyPricePerMwh);
  const [solarCapex, setSolarCapex] = useState(solarCapexPerMw);
  const [windCapex, setWindCapex] = useState(windCapexPerMw);

  const { data, isLoading, error } = useQuery<TechnologyRecommendationData>({
    queryKey: ['technology-recommendation', siteId, days, price, solarCapex, windCapex],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/technology-recommendation?days=${days}&energy_price_per_mwh=${price}&solar_capex_per_mw=${solarCapex}&wind_capex_per_mw=${windCapex}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
    enabled: !!siteId,
    staleTime: 3600000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Analyzing technology options...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">
            {error instanceof Error ? error.message : 'Failed to load technology recommendation'}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (data.error || data.message) {
    return (
      <EmptyState
        dense={compact}
        title="Technology screening"
        body={
          data.message ||
          data.error ||
          'Need more weather history here, or run a load-based shortlist on Plan technology.'
        }
        icon={<WarningIcon fontSize="inherit" />}
        action={
          <Button component={RouterLink} to="/plan" variant="contained" size="small">
            Open Plan technology
          </Button>
        }
      />
    );
  }

  const getResourceClassColor = (resourceClass: string) => {
    switch (resourceClass) {
      case 'Excellent':
        return 'success';
      case 'Good':
        return 'info';
      case 'Fair':
        return 'warning';
      default:
        return 'error';
    }
  };

  const getTechnologyIcon = (tech: string) => {
    switch (tech) {
      case 'solar':
        return <SolarPowerIcon />;
      case 'wind':
        return <AirIcon />;
      case 'hybrid':
        return <HubIcon />;
      default:
        return <WarningIcon />;
    }
  };

  const quality = data.data_quality || 'low';
  const qualitySeverity =
    quality === 'high' ? 'success' : quality === 'medium' ? 'info' : 'warning';

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" component="h2">
            Technology Recommendation Analysis
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip
              label={`Data quality: ${quality}`}
              size="small"
              color={qualitySeverity as 'success' | 'info' | 'warning'}
            />
            <Chip
              label={`${data.data_points_analyzed} data points • ${data.analysis_period_days} days`}
              size="small"
              color="primary"
            />
          </Stack>
        </Box>

        <Box mb={3}>
          <Typography variant="subtitle2" gutterBottom>
            Analysis assumptions
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Energy price ($/MWh)"
              type="number"
              size="small"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              inputProps={{ min: 0, step: 1 }}
            />
            <TextField
              label="Solar CAPEX ($/MW)"
              type="number"
              size="small"
              value={solarCapex}
              onChange={(e) => setSolarCapex(Number(e.target.value))}
              inputProps={{ min: 0, step: 1000 }}
            />
            <TextField
              label="Wind CAPEX ($/MW)"
              type="number"
              size="small"
              value={windCapex}
              onChange={(e) => setWindCapex(Number(e.target.value))}
              inputProps={{ min: 0, step: 1000 }}
            />
          </Stack>
        </Box>

        {quality === 'low' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Weather sample is short. Confidence is capped; treat this as indicative only.
          </Alert>
        )}

        <Box mb={4}>
          <Alert
            severity={data.recommendations.confidence === 'high' ? 'success' : 'warning'}
            icon={getTechnologyIcon(data.recommendations.recommended_technology)}
            sx={{ mb: 2 }}
          >
            <Typography variant="h6" gutterBottom>
              Recommended Technology: {data.recommendations.recommended_technology.toUpperCase()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Confidence: <strong>{data.recommendations.confidence}</strong>
              {data.model_version ? ` • Model: ${data.model_version}` : null}
            </Typography>
            {data.recommendations.reasoning.length > 0 && (
              <Box mt={1}>
                <Typography variant="body2" component="div">
                  <strong>Reasoning:</strong>
                  <ul style={{ marginTop: 8, marginBottom: 0 }}>
                    {data.recommendations.reasoning.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </Typography>
              </Box>
            )}
          </Alert>
        </Box>

        <Grid container spacing={3}>
          {data.solar_analysis && (
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <SolarPowerIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="h6">Solar Analysis</Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Avg GHI
                      </Typography>
                      <Typography variant="h6">
                        {data.solar_analysis.avg_ghi_w_per_m2} W/m²
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Resource Class
                      </Typography>
                      <Chip
                        label={data.solar_analysis.solar_resource_class}
                        color={getResourceClassColor(data.solar_analysis.solar_resource_class) as any}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Capacity Factor
                      </Typography>
                      <Typography variant="h6" color="primary">
                        {data.solar_analysis.estimated_capacity_factor_percent.toFixed(1)}%
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Annual Energy
                      </Typography>
                      <Typography variant="h6">
                        {data.solar_analysis.annual_energy_gwh.toFixed(2)} GWh
                      </Typography>
                    </Grid>
                  </Grid>
                  {data.financial_analysis.solar && (
                    <Box mt={2} pt={2} borderTop={1} borderColor="divider">
                      <Typography variant="subtitle2" gutterBottom>
                        Financial Summary
                      </Typography>
                      <Typography variant="body2">
                        CAPEX: ${(data.financial_analysis.solar.capex_usd / 1000000).toFixed(2)}M
                      </Typography>
                      <Typography variant="body2">
                        Annual Revenue: $
                        {(data.financial_analysis.solar.annual_revenue_usd / 1000).toFixed(0)}K
                      </Typography>
                      <Typography variant="body2">
                        LCOE: ${data.financial_analysis.solar.lcoe_usd_per_mwh.toFixed(2)}/MWh
                      </Typography>
                      <Typography variant="body2">
                        Payback: {data.financial_analysis.solar.payback_years.toFixed(1)} years
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}

          {data.wind_analysis && (
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <AirIcon sx={{ mr: 1, color: 'info.main' }} />
                    <Typography variant="h6">Wind Analysis</Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Avg Wind Speed
                      </Typography>
                      <Typography variant="h6">
                        {data.wind_analysis.avg_wind_speed_m_per_s.toFixed(1)} m/s
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Resource Class
                      </Typography>
                      <Chip
                        label={data.wind_analysis.wind_resource_class}
                        color={getResourceClassColor(data.wind_analysis.wind_resource_class) as any}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Capacity Factor
                      </Typography>
                      <Typography variant="h6" color="info.main">
                        {data.wind_analysis.estimated_capacity_factor_percent.toFixed(1)}%
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">
                        Annual Energy
                      </Typography>
                      <Typography variant="h6">
                        {data.wind_analysis.annual_energy_gwh.toFixed(2)} GWh
                      </Typography>
                    </Grid>
                  </Grid>
                  {data.financial_analysis.wind && (
                    <Box mt={2} pt={2} borderTop={1} borderColor="divider">
                      <Typography variant="subtitle2" gutterBottom>
                        Financial Summary
                      </Typography>
                      <Typography variant="body2">
                        CAPEX: ${(data.financial_analysis.wind.capex_usd / 1000000).toFixed(2)}M
                      </Typography>
                      <Typography variant="body2">
                        Annual Revenue: $
                        {(data.financial_analysis.wind.annual_revenue_usd / 1000).toFixed(0)}K
                      </Typography>
                      <Typography variant="body2">
                        LCOE: ${data.financial_analysis.wind.lcoe_usd_per_mwh.toFixed(2)}/MWh
                      </Typography>
                      <Typography variant="body2">
                        Payback: {data.financial_analysis.wind.payback_years.toFixed(1)} years
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}

          {data.hybrid_analysis && (
            <Grid item xs={12}>
              <Card variant="outlined" sx={{ bgcolor: 'rgba(76, 175, 80, 0.05)' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <HubIcon sx={{ mr: 1, color: 'success.main' }} />
                    <Typography variant="h6">Hybrid (50% Solar / 50% Wind)</Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={3}>
                      <Typography variant="body2" color="text.secondary">
                        Annual Energy
                      </Typography>
                      <Typography variant="h6">
                        {data.hybrid_analysis.annual_energy_gwh.toFixed(2)} GWh
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Typography variant="body2" color="text.secondary">
                        CAPEX
                      </Typography>
                      <Typography variant="h6">
                        ${(data.hybrid_analysis.capex_usd / 1000000).toFixed(2)}M
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Typography variant="body2" color="text.secondary">
                        Annual Revenue
                      </Typography>
                      <Typography variant="h6" color="success.main">
                        ${(data.hybrid_analysis.annual_revenue_usd / 1000).toFixed(0)}K
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Typography variant="body2" color="text.secondary">
                        LCOE
                      </Typography>
                      <Typography variant="h6">
                        ${data.hybrid_analysis.lcoe_usd_per_mwh.toFixed(2)}/MWh
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}

          {(data.financial_analysis.solar || data.financial_analysis.wind || data.hybrid_analysis) && (
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                Financial Comparison
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Metric</TableCell>
                      {data.financial_analysis.solar && <TableCell align="right">Solar</TableCell>}
                      {data.financial_analysis.wind && <TableCell align="right">Wind</TableCell>}
                      {data.hybrid_analysis && <TableCell align="right">Hybrid</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>CAPEX</TableCell>
                      {data.financial_analysis.solar && (
                        <TableCell align="right">
                          ${(data.financial_analysis.solar.capex_usd / 1000000).toFixed(2)}M
                        </TableCell>
                      )}
                      {data.financial_analysis.wind && (
                        <TableCell align="right">
                          ${(data.financial_analysis.wind.capex_usd / 1000000).toFixed(2)}M
                        </TableCell>
                      )}
                      {data.hybrid_analysis && (
                        <TableCell align="right">
                          ${(data.hybrid_analysis.capex_usd / 1000000).toFixed(2)}M
                        </TableCell>
                      )}
                    </TableRow>
                    <TableRow>
                      <TableCell>Annual Revenue</TableCell>
                      {data.financial_analysis.solar && (
                        <TableCell align="right">
                          ${(data.financial_analysis.solar.annual_revenue_usd / 1000).toFixed(0)}K
                        </TableCell>
                      )}
                      {data.financial_analysis.wind && (
                        <TableCell align="right">
                          ${(data.financial_analysis.wind.annual_revenue_usd / 1000).toFixed(0)}K
                        </TableCell>
                      )}
                      {data.hybrid_analysis && (
                        <TableCell align="right">
                          ${(data.hybrid_analysis.annual_revenue_usd / 1000).toFixed(0)}K
                        </TableCell>
                      )}
                    </TableRow>
                    <TableRow>
                      <TableCell>LCOE ($/MWh)</TableCell>
                      {data.financial_analysis.solar && (
                        <TableCell align="right">
                          ${data.financial_analysis.solar.lcoe_usd_per_mwh.toFixed(2)}
                        </TableCell>
                      )}
                      {data.financial_analysis.wind && (
                        <TableCell align="right">
                          ${data.financial_analysis.wind.lcoe_usd_per_mwh.toFixed(2)}
                        </TableCell>
                      )}
                      {data.hybrid_analysis && (
                        <TableCell align="right">
                          ${data.hybrid_analysis.lcoe_usd_per_mwh.toFixed(2)}
                        </TableCell>
                      )}
                    </TableRow>
                    <TableRow>
                      <TableCell>Payback Period (years)</TableCell>
                      {data.financial_analysis.solar && (
                        <TableCell align="right">
                          {data.financial_analysis.solar.payback_years.toFixed(1)}
                        </TableCell>
                      )}
                      {data.financial_analysis.wind && (
                        <TableCell align="right">
                          {data.financial_analysis.wind.payback_years.toFixed(1)}
                        </TableCell>
                      )}
                      {data.hybrid_analysis && (
                        <TableCell align="right">
                          {data.hybrid_analysis.payback_years.toFixed(1)}
                        </TableCell>
                      )}
                    </TableRow>
                    <TableRow>
                      <TableCell>NPV (20 years)</TableCell>
                      {data.financial_analysis.solar && (
                        <TableCell align="right">
                          ${(data.financial_analysis.solar.npv_20yr_usd / 1000000).toFixed(2)}M
                        </TableCell>
                      )}
                      {data.financial_analysis.wind && (
                        <TableCell align="right">
                          ${(data.financial_analysis.wind.npv_20yr_usd / 1000000).toFixed(2)}M
                        </TableCell>
                      )}
                      {data.hybrid_analysis && (
                        <TableCell align="right">
                          ${(data.hybrid_analysis.npv_20yr_usd / 1000000).toFixed(2)}M
                        </TableCell>
                      )}
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          )}

          <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Applied assumptions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Energy Price: ${data.assumptions.energy_price_per_mwh}/MWh • Solar CAPEX: $
              {(data.assumptions.solar_capex_per_mw / 1000).toFixed(0)}K/MW • Wind CAPEX: $
              {(data.assumptions.wind_capex_per_mw / 1000).toFixed(0)}K/MW • Discount Rate:{' '}
              {(data.assumptions.discount_rate * 100).toFixed(0)}%
            </Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default TechnologyRecommendation;
