import React from 'react';
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
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import SolarPowerIcon from '@mui/icons-material/SolarPower';
import AirIcon from '@mui/icons-material/Air';
import HubIcon from '@mui/icons-material/Hub';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface TechnologyRecommendationProps {
  siteId: string;
  days?: number;
  energyPricePerMwh?: number;
  solarCapexPerMw?: number;
  windCapexPerMw?: number;
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
    solar_efficiency: number;
    solar_availability: number;
    discount_rate: number;
  };
  error?: string;
  message?: string;
}

const TechnologyRecommendation: React.FC<TechnologyRecommendationProps> = ({
  siteId,
  days = 365,
  energyPricePerMwh = 50,
  solarCapexPerMw = 1000000,
  windCapexPerMw = 1500000,
}) => {
  const { data, isLoading, error } = useQuery<TechnologyRecommendationData>({
    queryKey: ['technology-recommendation', siteId, days, energyPricePerMwh, solarCapexPerMw, windCapexPerMw],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/technology-recommendation?days=${days}&energy_price_per_mwh=${energyPricePerMwh}&solar_capex_per_mw=${solarCapexPerMw}&wind_capex_per_mw=${windCapexPerMw}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
    enabled: !!siteId,
    staleTime: 3600000, // 1 hour - analysis doesn't change frequently
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
      <Card>
        <CardContent>
          <Alert severity="warning">{data.message || data.error || 'Unable to analyze technology options'}</Alert>
        </CardContent>
      </Card>
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

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'success';
      case 'medium':
        return 'warning';
      default:
        return 'error';
    }
  };

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" component="h2">
            Technology Recommendation Analysis
          </Typography>
          <Chip
            label={`${data.data_points_analyzed} data points • ${data.analysis_period_days} days`}
            size="small"
            color="primary"
          />
        </Box>

        {/* Recommendation Summary */}
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
          {/* Solar Analysis */}
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
                        Annual Revenue: ${(data.financial_analysis.solar.annual_revenue_usd / 1000).toFixed(0)}K
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

          {/* Wind Analysis */}
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
                        Annual Revenue: ${(data.financial_analysis.wind.annual_revenue_usd / 1000).toFixed(0)}K
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

          {/* Hybrid Analysis */}
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

          {/* Financial Comparison Table */}
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
                    {(data.financial_analysis.solar || data.financial_analysis.wind) && (
                      <>
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
                      </>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          )}

          {/* Assumptions */}
          <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Analysis Assumptions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Energy Price: ${data.assumptions.energy_price_per_mwh}/MWh • 
              Solar CAPEX: ${(data.assumptions.solar_capex_per_mw / 1000).toFixed(0)}K/MW • 
              Wind CAPEX: ${(data.assumptions.wind_capex_per_mw / 1000).toFixed(0)}K/MW • 
              Discount Rate: {(data.assumptions.discount_rate * 100).toFixed(0)}%
            </Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default TechnologyRecommendation;

