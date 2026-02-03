import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import ForecastChart from '../components/charts/ForecastChartSimple';
import WeatherHistoryChart from '../components/charts/WeatherHistoryChart';
import ProductionHistoryChart from '../components/charts/ProductionHistoryChart';
import SiteStatusIndicator from '../components/SiteStatusIndicator';
import ForecastHorizonToggle from '../components/ForecastHorizonToggle';
import EditSiteForm from '../components/forms/EditSiteForm';
import ExportButton from '../components/ExportButton';
import AlertsPanel from '../components/AlertsPanel';
import CreateAlertForm from '../components/forms/CreateAlertForm';
import ForecastSuggestions from '../components/ForecastSuggestions';
import ForecastAccuracyMetrics from '../components/ForecastAccuracyMetrics';
import CurrentWeatherDisplay from '../components/CurrentWeatherDisplay';
import ForecastComparisonPanel from '../components/ForecastComparisonPanel';
import ForecastAnalyticsDashboard from '../components/ForecastAnalyticsDashboard';
import ProductionSchedulingPanel from '../components/ProductionSchedulingPanel';
import InteractiveForecastAdjustments from '../components/InteractiveForecastAdjustments';
import AIPoweredInsights from '../components/AIPoweredInsights';
import TechnologyRecommendation from '../components/TechnologyRecommendation';
import { useSitePerformance } from '../hooks/useSitePerformance';
import { notificationService } from '../services/notificationService';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SpeedIcon from '@mui/icons-material/Speed';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import AssessmentIcon from '@mui/icons-material/Assessment';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';

// Fix for default marker icon in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface Site {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  capacity_mw: number;
  timezone: string;
  created_at?: string;
}

const SiteDetail: React.FC = () => {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [performanceDays, setPerformanceDays] = useState(30);
  const [forecastHorizon, setForecastHorizon] = useState<'24h' | '48h' | '7d' | '30d'>('24h');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createAlertDialogOpen, setCreateAlertDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const { data: site, isLoading, error } = useQuery<Site>({
    queryKey: ['site', siteId],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(`${API_URL}/v1/sites/${siteId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    },
    enabled: !!siteId,
  });

  const { data: performance, isLoading: performanceLoading } = useSitePerformance(
    siteId || '',
    performanceDays
  );

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Invalidate queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['forecast', siteId] });
      queryClient.invalidateQueries({ queryKey: ['forecast_accuracy', siteId] });
      queryClient.invalidateQueries({ queryKey: ['current_weather', siteId] });
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      setLastUpdate(new Date());
    }, 300000); // Refresh every 5 minutes

    return () => clearInterval(interval);
  }, [autoRefresh, siteId, queryClient]);

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!siteId) return;

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      await axios.delete(`${API_URL}/v1/sites/${siteId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const siteName = site?.name || 'Site';
      notificationService.success(`Site "${siteName}" deleted successfully`);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['forecast'] });
      
      // Navigate back to sites overview
      navigate('/');
    } catch (err: any) {
      console.error('Error deleting site:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to delete site';
      notificationService.error(errorMessage);
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading site details...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">
          Error loading site: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
          sx={{ mt: 2 }}
        >
          Back to Sites
        </Button>
      </Container>
    );
  }

  if (!site) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="warning">Site not found</Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
          sx={{ mt: 2 }}
        >
          Back to Sites
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/')}
        sx={{ mb: 3 }}
      >
        Back to Sites
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">{site.name}</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <SiteStatusIndicator siteId={site.id} size="medium" showDetails={false} />
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => setEditDialogOpen(true)}
          >
            Edit Site
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={handleDeleteClick}
          >
            Delete Site
          </Button>
        </Box>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Chip
          label={site.type.toUpperCase()}
          color={site.type === 'solar' ? 'primary' : site.type === 'wind' ? 'secondary' : 'default'}
          sx={{ mr: 1 }}
        />
        <Chip label={`${site.capacity_mw} MW`} variant="outlined" />
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Site Information
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => setEditDialogOpen(true)}
                >
                  Edit
                </Button>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  <strong>Type:</strong> {site.type}
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  <strong>Capacity:</strong> {site.capacity_mw} MW
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  <strong>Location:</strong> {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  <strong>Timezone:</strong> {site.timezone}
                </Typography>
                {site.created_at && (
                  <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                    <strong>Created:</strong>{' '}
                    {new Date(site.created_at).toLocaleDateString()}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Location Map
              </Typography>
              <Box
                sx={{
                  mt: 2,
                  height: 300,
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <MapContainer
                  center={[site.latitude, site.longitude]}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[site.latitude, site.longitude]}>
                    <Popup>
                      <strong>{site.name}</strong><br />
                      {site.type} - {site.capacity_mw} MW<br />
                      {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                    </Popup>
                  </Marker>
                </MapContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h6">
                  {forecastHorizon === '24h' ? '24-Hour' : 
                   forecastHorizon === '48h' ? '48-Hour' : 
                   forecastHorizon === '7d' ? '7-Day' : '30-Day'} Forecast
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <ForecastHorizonToggle
                    value={forecastHorizon}
                    onChange={(horizon) => setForecastHorizon(horizon)}
                  />
                  <Button
                    size="small"
                    variant={autoRefresh ? 'contained' : 'outlined'}
                    startIcon={<RefreshIcon />}
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ['forecast', site.id] });
                      queryClient.invalidateQueries({ queryKey: ['forecast_accuracy', site.id] });
                      queryClient.invalidateQueries({ queryKey: ['current_weather', site.id] });
                      setLastUpdate(new Date());
                    }}
                  >
                    Refresh
                  </Button>
                  <Button
                    size="small"
                    variant={autoRefresh ? 'contained' : 'outlined'}
                    onClick={() => setAutoRefresh(!autoRefresh)}
                  >
                    {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
                  </Button>
                  <ExportButton
                    siteId={site.id}
                    exportType="forecast"
                    horizon={forecastHorizon}
                  />
                </Box>
              </Box>
              <Box sx={{ mt: 2 }}>
                <ForecastChart 
                  siteId={site.id} 
                  horizon={forecastHorizon === '24h' ? 24 : 
                           forecastHorizon === '48h' ? 48 : 
                           forecastHorizon === '7d' ? 168 : 720} 
                  showConfidence={true} 
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Current Weather Display */}
        <Grid item xs={12}>
          <CurrentWeatherDisplay siteId={site.id} />
        </Grid>

        {/* Forecast Accuracy Metrics */}
        <Grid item xs={12}>
          <ForecastAccuracyMetrics
            siteId={site.id}
            days={30}
            horizon={forecastHorizon}
          />
        </Grid>

        {/* Forecast Suggestions */}
        <Grid item xs={12}>
          <ForecastSuggestions
            siteId={site.id}
            horizon={forecastHorizon === '24h' ? 24 : 
                     forecastHorizon === '48h' ? 48 : 
                     forecastHorizon === '7d' ? 168 : 720}
            siteType={site.type}
            capacityMw={site.capacity_mw}
          />
        </Grid>

        {/* Performance Metrics */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  Performance Metrics
                </Typography>
                <Box>
                  {[7, 30, 90].map((d) => (
                    <Button
                      key={d}
                      size="small"
                      variant={performanceDays === d ? 'contained' : 'outlined'}
                      onClick={() => setPerformanceDays(d)}
                      sx={{ ml: 1 }}
                    >
                      {d}d
                    </Button>
                  ))}
                </Box>
              </Box>
              {performanceLoading ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : performance ? (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
                      <BatteryChargingFullIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                      <Typography variant="h4" color="primary.main">
                        {performance.capacity_factor || 0}%
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Capacity Factor
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                      <TrendingUpIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                      <Typography variant="h4" color="success.main">
                        {(performance.average_power_kw || 0).toLocaleString()} kW
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Average Power
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                      <SpeedIcon sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
                      <Typography variant="h4" color="info.main">
                        {(performance.total_energy_kwh || 0).toLocaleString()} kWh
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Total Energy ({performanceDays}d)
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                      <AssessmentIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
                      <Typography variant="h4" color="warning.main">
                        {performance.average_availability || 0}%
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Availability
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="textSecondary">Max Power</Typography>
                          <Typography variant="h6">{(performance.max_power_kw || 0).toLocaleString()} kW</Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="textSecondary">Min Power</Typography>
                          <Typography variant="h6">{(performance.min_power_kw || 0).toLocaleString()} kW</Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="textSecondary">Efficiency</Typography>
                          <Typography variant="h6">{performance.average_efficiency || 0}%</Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="textSecondary">Data Points</Typography>
                          <Typography variant="h6">{(performance.data_points || 0).toLocaleString()}</Typography>
                        </Grid>
                      </Grid>
                    </Box>
                  </Grid>
                </Grid>
              ) : (
                <Typography color="textSecondary">
                  No performance data available
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Historical Weather Chart */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <WeatherHistoryChart siteId={site.id} days={7} />
            </CardContent>
          </Card>
        </Grid>

        {/* Production History Chart */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <ProductionHistoryChart siteId={site.id} days={7} />
            </CardContent>
          </Card>
        </Grid>

        {/* AI-Powered Insights */}
        <Grid item xs={12}>
          <AIPoweredInsights siteId={site.id} horizon={forecastHorizon} />
        </Grid>

        {/* Forecast Analytics Dashboard */}
        <Grid item xs={12}>
          <ForecastAnalyticsDashboard siteId={site.id} />
        </Grid>

        {/* Technology Recommendation Analysis */}
        <Grid item xs={12}>
          <TechnologyRecommendation siteId={site.id} days={365} />
        </Grid>

        {/* Interactive Forecast Adjustments */}
        <Grid item xs={12}>
          <InteractiveForecastAdjustments
            siteId={site.id}
            horizon={forecastHorizon === '24h' ? 24 : 
                     forecastHorizon === '48h' ? 48 : 
                     forecastHorizon === '7d' ? 168 : 720}
          />
        </Grid>

        {/* Production Scheduling Panel */}
        <Grid item xs={12}>
          <ProductionSchedulingPanel
            siteId={site.id}
            horizon={forecastHorizon}
          />
        </Grid>

        {/* Forecast Comparison Panel */}
        <Grid item xs={12}>
          <ForecastComparisonPanel
            siteId={site.id}
            horizon={forecastHorizon === '24h' ? 24 : 
                     forecastHorizon === '48h' ? 48 : 
                     forecastHorizon === '7d' ? 168 : 720}
          />
        </Grid>

        {/* Active Alerts Panel */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Active Alerts
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setCreateAlertDialogOpen(true)}
                >
                  Create Alert
                </Button>
              </Box>
              <AlertsPanel
                siteId={site.id}
                maxAlerts={5}
                showAcknowledge={true}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Last Update Indicator */}
      {autoRefresh && (
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="textSecondary">
            Auto-refresh enabled • Last updated: {lastUpdate.toLocaleTimeString()}
          </Typography>
        </Box>
      )}

      <EditSiteForm
        open={editDialogOpen}
        site={site ? {
          id: site.id,
          name: site.name,
          type: site.type as 'solar' | 'wind' | 'hybrid',
          latitude: site.latitude,
          longitude: site.longitude,
          capacity_mw: site.capacity_mw,
          timezone: site.timezone,
          pv_params: (site as any).pv_params,
          turbine_params: (site as any).turbine_params,
        } : null}
        onClose={() => setEditDialogOpen(false)}
        onSuccess={() => {
          // Query will auto-refresh due to invalidation in EditSiteForm
        }}
      />

      <CreateAlertForm
        open={createAlertDialogOpen}
        siteId={site?.id || ''}
        onClose={() => setCreateAlertDialogOpen(false)}
        onSuccess={() => {
          // Query will auto-refresh due to invalidation in CreateAlertForm
        }}
      />
      
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          Delete Site
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete the site "{site?.name}"? 
            This action cannot be undone and will also delete all associated forecasts, 
            alerts, and historical data.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SiteDetail;

