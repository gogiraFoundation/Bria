import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
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
  Tabs,
  Tab,
  Fade,
} from '@mui/material';
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
import ForecastAnalyticsDashboard from '../components/ForecastAnalyticsDashboard';
import PlanningWorkspace from '../components/PlanningWorkspace';
import { useSitePerformance } from '../hooks/useSitePerformance';
import { notificationService } from '../services/notificationService';
import PageHeader from '../components/ui/PageHeader';
import KpiStrip from '../components/ui/KpiStrip';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const TAB_KEYS = ['overview', 'forecast', 'analytics', 'planning', 'alerts'] as const;

function parseTabParam(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && asNum >= 0 && asNum < TAB_KEYS.length) {
    return asNum;
  }
  const idx = TAB_KEYS.indexOf(raw.toLowerCase() as (typeof TAB_KEYS)[number]);
  return idx >= 0 ? idx : 0;
}

interface Site {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  capacity_mw: number;
  timezone: string;
  created_at?: string;
  pv_params?: {
    financial?: {
      energy_price?: number;
      capex?: number;
    };
  };
  turbine_params?: {
    financial?: {
      energy_price?: number;
      capex?: number;
    };
  };
}

const SiteDetail: React.FC = () => {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [performanceDays, setPerformanceDays] = useState(30);
  const [forecastHorizon, setForecastHorizon] = useState<'24h' | '48h' | '7d' | '30d'>('24h');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createAlertDialogOpen, setCreateAlertDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [currentTab, setCurrentTab] = useState(() => parseTabParam(searchParams.get('tab')));

  useEffect(() => {
    setCurrentTab(parseTabParam(searchParams.get('tab')));
  }, [searchParams]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
    const next = new URLSearchParams(searchParams);
    next.set('tab', String(newValue));
    setSearchParams(next, { replace: true });
  };

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

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['forecast', siteId] });
      queryClient.invalidateQueries({ queryKey: ['forecast_accuracy', siteId] });
      queryClient.invalidateQueries({ queryKey: ['current_weather', siteId] });
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      setLastUpdate(new Date());
    }, 300000);

    return () => clearInterval(interval);
  }, [autoRefresh, siteId, queryClient]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['forecast', siteId] });
    queryClient.invalidateQueries({ queryKey: ['forecast_accuracy', siteId] });
    queryClient.invalidateQueries({ queryKey: ['current_weather', siteId] });
    queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    setLastUpdate(new Date());
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

      notificationService.success(`Site "${site?.name || 'Site'}" deleted successfully`);
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['forecast'] });
      navigate('/');
    } catch (err: any) {
      console.error('Error deleting site:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to delete site';
      notificationService.error(errorMessage);
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const horizonHours =
    forecastHorizon === '24h' ? 24 : forecastHorizon === '48h' ? 48 : forecastHorizon === '7d' ? 168 : 720;

  if (isLoading) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }} color="text.secondary">
          Loading site…
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          Error loading site: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
        <Button onClick={() => navigate('/')}>Back to Sites</Button>
      </Box>
    );
  }

  if (!site) {
    return (
      <Box>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Site not found
        </Alert>
        <Button onClick={() => navigate('/')}>Back to Sites</Button>
      </Box>
    );
  }

  const overviewKpis = performance
    ? [
        {
          label: 'Capacity factor',
          value: `${performance.capacity_factor || 0}%`,
          tone: 'renewable' as const,
        },
        {
          label: 'Average power',
          value: `${(performance.average_power_kw || 0).toLocaleString()} kW`,
        },
        {
          label: 'Availability',
          value: `${performance.average_availability || 0}%`,
        },
      ]
    : [];

  return (
    <Box>
      <PageHeader
        title={site.name}
        breadcrumbs={[
          { label: 'Sites', href: '/' },
          { label: site.name },
        ]}
        status={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <SiteStatusIndicator siteId={site.id} size="medium" showDetails={false} />
            <Chip
              label={site.type.toUpperCase()}
              size="small"
              color={site.type === 'solar' ? 'primary' : site.type === 'wind' ? 'secondary' : 'default'}
            />
            <Chip label={`${site.capacity_mw} MW`} size="small" variant="outlined" />
          </Box>
        }
        primaryAction={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
            >
              Refresh
            </Button>
            <ExportButton siteId={site.id} exportType="forecast" horizon={forecastHorizon} />
          </Box>
        }
        secondaryActions={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<EditIcon />}
              onClick={() => setEditDialogOpen(true)}
            >
              Edit
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete
            </Button>
          </Box>
        }
      />

      <Card sx={{ mb: 3 }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 56,
            },
          }}
        >
          <Tab label="Overview" />
          <Tab label="Forecast" />
          <Tab label="Analytics" />
          <Tab label="Planning" />
          <Tab label="Alerts" />
        </Tabs>
      </Card>

      <Box sx={{ minHeight: 360 }}>
        {currentTab === 0 && (
          <Fade in timeout={250}>
            <Box>
              {performanceLoading ? (
                <Box sx={{ mb: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                overviewKpis.length > 0 && <KpiStrip items={overviewKpis} />
              )}
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Site information</Typography>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => setEditDialogOpen(true)}
                        >
                          Edit
                        </Button>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Type:</strong> {site.type}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        <strong>Capacity:</strong> {site.capacity_mw} MW
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        <strong>Location:</strong> {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        <strong>Timezone:</strong> {site.timezone}
                      </Typography>
                      {site.created_at && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          <strong>Created:</strong>{' '}
                          {new Date(site.created_at).toLocaleDateString()}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Location
                      </Typography>
                      <Box
                        sx={{
                          mt: 1,
                          height: 280,
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
                              <strong>{site.name}</strong>
                              <br />
                              {site.type} · {site.capacity_mw} MW
                            </Popup>
                          </Marker>
                        </MapContainer>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          </Fade>
        )}

        {currentTab === 1 && (
          <Fade in timeout={250}>
            <Box>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 2,
                        flexWrap: 'wrap',
                        gap: 2,
                      }}
                    >
                      <Typography variant="h6">
                        {forecastHorizon === '24h'
                          ? '24-hour'
                          : forecastHorizon === '48h'
                            ? '48-hour'
                            : forecastHorizon === '7d'
                              ? '7-day'
                              : '30-day'}{' '}
                        power forecast
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <ForecastHorizonToggle
                          value={forecastHorizon}
                          onChange={(horizon) => setForecastHorizon(horizon)}
                        />
                        <Button
                          size="small"
                          variant={autoRefresh ? 'contained' : 'outlined'}
                          onClick={() => setAutoRefresh(!autoRefresh)}
                        >
                          {autoRefresh ? 'Auto: on' : 'Auto: off'}
                        </Button>
                      </Box>
                    </Box>
                    <ForecastChart siteId={site.id} horizon={horizonHours} showConfidence={true} />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <CurrentWeatherDisplay siteId={site.id} />
              </Grid>
              <Grid item xs={12} md={6}>
                <ForecastAccuracyMetrics siteId={site.id} days={30} horizon={forecastHorizon} />
              </Grid>
              <Grid item xs={12} md={6}>
                <ForecastSuggestions
                  siteId={site.id}
                  horizon={horizonHours}
                  siteType={site.type}
                  capacityMw={site.capacity_mw}
                />
              </Grid>
            </Grid>
            </Box>
          </Fade>
        )}

        {currentTab === 2 && (
          <Fade in timeout={250}>
            <Box>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <Typography variant="h6">Performance</Typography>
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
                      <KpiStrip
                        items={[
                          {
                            label: 'Capacity factor',
                            value: `${performance.capacity_factor || 0}%`,
                            tone: 'renewable',
                          },
                          {
                            label: 'Average power',
                            value: `${(performance.average_power_kw || 0).toLocaleString()} kW`,
                          },
                          {
                            label: `Total energy (${performanceDays}d)`,
                            value: `${(performance.total_energy_kwh || 0).toLocaleString()} kWh`,
                          },
                          {
                            label: 'Availability',
                            value: `${performance.average_availability || 0}%`,
                          },
                        ]}
                      />
                    ) : (
                      <Typography color="text.secondary">No performance data available</Typography>
                    )}
                    {performance && (
                      <Grid container spacing={2} sx={{ mt: 0 }}>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="text.secondary">
                            Max power
                          </Typography>
                          <Typography variant="h6">
                            {(performance.max_power_kw || 0).toLocaleString()} kW
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="text.secondary">
                            Min power
                          </Typography>
                          <Typography variant="h6">
                            {(performance.min_power_kw || 0).toLocaleString()} kW
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="text.secondary">
                            Efficiency
                          </Typography>
                          <Typography variant="h6">
                            {performance.average_efficiency || 0}%
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="text.secondary">
                            Data points
                          </Typography>
                          <Typography variant="h6">
                            {(performance.data_points || 0).toLocaleString()}
                          </Typography>
                        </Grid>
                      </Grid>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <ForecastAnalyticsDashboard siteId={site.id} />
              </Grid>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <WeatherHistoryChart siteId={site.id} days={7} />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <ProductionHistoryChart siteId={site.id} days={7} />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            </Box>
          </Fade>
        )}

        {currentTab === 3 && (
          <Fade in timeout={250}>
            <Box>
              <PlanningWorkspace
                siteId={site.id}
                forecastHorizon={forecastHorizon}
                horizonHours={horizonHours}
                energyPricePerMwh={
                  site.pv_params?.financial?.energy_price ??
                  site.turbine_params?.financial?.energy_price ??
                  50
                }
                solarCapexPerMw={
                  site.pv_params?.financial?.capex && site.capacity_mw
                    ? site.pv_params.financial.capex / site.capacity_mw
                    : 1000000
                }
                windCapexPerMw={
                  site.turbine_params?.financial?.capex && site.capacity_mw
                    ? site.turbine_params.financial.capex / site.capacity_mw
                    : 1500000
                }
              />
            </Box>
          </Fade>
        )}

        {currentTab === 4 && (
          <Fade in timeout={250}>
            <Box>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 2,
                      }}
                    >
                      <Typography variant="h6">Active alerts</Typography>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => setCreateAlertDialogOpen(true)}
                      >
                        Create alert
                      </Button>
                    </Box>
                    <AlertsPanel siteId={site.id} maxAlerts={10} showAcknowledge={true} />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            </Box>
          </Fade>
        )}
      </Box>

      {autoRefresh && (
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Auto-refresh on · Last updated {lastUpdate.toLocaleTimeString()}
          </Typography>
        </Box>
      )}

      <EditSiteForm
        open={editDialogOpen}
        site={
          site
            ? {
                id: site.id,
                name: site.name,
                type: site.type as 'solar' | 'wind' | 'hybrid',
                latitude: site.latitude,
                longitude: site.longitude,
                capacity_mw: site.capacity_mw,
                timezone: site.timezone,
                pv_params: (site as any).pv_params,
                turbine_params: (site as any).turbine_params,
              }
            : null
        }
        onClose={() => setEditDialogOpen(false)}
        onSuccess={() => undefined}
      />

      <CreateAlertForm
        open={createAlertDialogOpen}
        siteId={site?.id || ''}
        onClose={() => setCreateAlertDialogOpen(false)}
        onSuccess={() => undefined}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        aria-labelledby="delete-dialog-title"
      >
        <DialogTitle id="delete-dialog-title">Delete site</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the site &quot;{site?.name}&quot;? This cannot be
            undone and will also delete associated forecasts, alerts, and historical data.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SiteDetail;
