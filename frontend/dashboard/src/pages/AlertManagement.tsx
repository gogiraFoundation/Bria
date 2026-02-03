import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Button,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as AcknowledgeIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CreateAlertForm from '../components/forms/CreateAlertForm';
import { notificationService } from '../services/notificationService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface Site {
  id: string;
  name: string;
  type: string;
}

interface AlertData {
  id: string;
  site_id: string;
  site_name?: string;
  name: string;
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  last_triggered?: string;
  last_triggered_relative?: string;
  active_event_count?: number;
  created_at?: string;
}

const AlertManagement: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'enabled' | 'disabled'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSiteForAlert, setSelectedSiteForAlert] = useState<string>('');

  // Fetch all sites
  const { data: sites } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const response = await axios.get(`${API_URL}/v1/sites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
  });

  // Fetch all alerts
  const { data: alertsData, isLoading, error, refetch } = useQuery<{
    alerts: AlertData[];
    summary: { total: number; critical: number; warning: number; info: number };
  }>({
    queryKey: ['all-alerts', selectedSite, selectedSeverity, statusFilter],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');

      // Fetch alerts from all sites
      const allAlerts: AlertData[] = [];
      
      if (selectedSite === 'all') {
        // Get alerts from all sites
        if (sites) {
          for (const site of sites) {
            try {
              const response = await axios.get(`${API_URL}/v1/sites/${site.id}/alerts`, {
                params: { status: statusFilter === 'active' ? 'active' : 'all' },
                headers: { Authorization: `Bearer ${token}` },
              });
              const siteAlerts = response.data.alerts || [];
              siteAlerts.forEach((alert: any) => {
                allAlerts.push({
                  ...alert,
                  site_name: site.name,
                });
              });
            } catch (err) {
              console.error(`Failed to fetch alerts for site ${site.id}:`, err);
            }
          }
        }
      } else {
        // Get alerts from selected site
        const response = await axios.get(`${API_URL}/v1/sites/${selectedSite}/alerts`, {
          params: { status: statusFilter === 'active' ? 'active' : 'all' },
          headers: { Authorization: `Bearer ${token}` },
        });
        const siteAlerts = response.data.alerts || [];
        const site = sites?.find(s => s.id === selectedSite);
        siteAlerts.forEach((alert: any) => {
          allAlerts.push({
            ...alert,
            site_name: site?.name,
          });
        });
      }

      // Filter by severity
      let filteredAlerts = allAlerts;
      if (selectedSeverity !== 'all') {
        filteredAlerts = allAlerts.filter(a => a.severity === selectedSeverity);
      }

      // Filter by enabled status
      if (statusFilter === 'enabled') {
        filteredAlerts = filteredAlerts.filter(a => a.enabled);
      } else if (statusFilter === 'disabled') {
        filteredAlerts = filteredAlerts.filter(a => !a.enabled);
      }

      // Calculate summary
      const summary = {
        total: filteredAlerts.length,
        critical: filteredAlerts.filter(a => a.severity === 'critical').length,
        warning: filteredAlerts.filter(a => a.severity === 'high' || a.severity === 'medium').length,
        info: filteredAlerts.filter(a => a.severity === 'low').length,
      };

      return { alerts: filteredAlerts, summary };
    },
    enabled: !!sites,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleAcknowledge = async (alertId: string) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');

      await axios.post(
        `${API_URL}/v1/alerts/${alertId}/acknowledge`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      queryClient.invalidateQueries({ queryKey: ['all-alerts'] });
      notificationService.success('Alert acknowledged');
    } catch (err: any) {
      notificationService.error(err.response?.data?.detail || 'Failed to acknowledge alert');
    }
  };

  const handleToggleEnabled = async (alertId: string, enabled: boolean) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');

      await axios.put(
        `${API_URL}/v1/alerts/${alertId}`,
        { enabled: !enabled },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      queryClient.invalidateQueries({ queryKey: ['all-alerts'] });
      notificationService.success(`Alert ${!enabled ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      notificationService.error(err.response?.data?.detail || 'Failed to update alert');
    }
  };

  const handleDelete = async (alertId: string) => {
    if (!window.confirm('Are you sure you want to delete this alert?')) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');

      await axios.delete(`${API_URL}/v1/alerts/${alertId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      queryClient.invalidateQueries({ queryKey: ['all-alerts'] });
      notificationService.success('Alert deleted');
    } catch (err: any) {
      notificationService.error(err.response?.data?.detail || 'Failed to delete alert');
    }
  };

  const handleCreateAlert = () => {
    if (!sites || sites.length === 0) {
      notificationService.warning('No sites available. Please create a site first.');
      return;
    }
    setSelectedSiteForAlert(selectedSite !== 'all' ? selectedSite : sites[0].id);
    setCreateDialogOpen(true);
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Alert Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateAlert}
        >
          Create Alert
        </Button>
      </Box>

      {/* Summary Cards */}
      {alertsData && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Alerts
                </Typography>
                <Typography variant="h4">
                  {alertsData.summary.total}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Critical
                </Typography>
                <Typography variant="h4" color="error">
                  {alertsData.summary.critical}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Warnings
                </Typography>
                <Typography variant="h4" color="warning.main">
                  {alertsData.summary.warning}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Info
                </Typography>
                <Typography variant="h4" color="info.main">
                  {alertsData.summary.info}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Site</InputLabel>
                <Select
                  value={selectedSite}
                  label="Site"
                  onChange={(e) => setSelectedSite(e.target.value)}
                >
                  <MenuItem value="all">All Sites</MenuItem>
                  {sites?.map((site) => (
                    <MenuItem key={site.id} value={site.id}>
                      {site.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Severity</InputLabel>
                <Select
                  value={selectedSeverity}
                  label="Severity"
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="enabled">Enabled</MenuItem>
                  <MenuItem value="disabled">Disabled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={2}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => refetch()}
              >
                Refresh
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Alerts List */}
      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">
          Failed to load alerts: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      ) : !alertsData || alertsData.alerts.length === 0 ? (
        <Card>
          <CardContent>
            <Alert severity="info">
              No alerts found. Create your first alert to get started.
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Alert Name</TableCell>
                <TableCell>Site</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Triggered</TableCell>
                <TableCell>Events</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alertsData.alerts.map((alert) => (
                <TableRow key={alert.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {alert.name}
                    </Typography>
                    {alert.description && (
                      <Typography variant="caption" color="textSecondary">
                        {alert.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      onClick={() => navigate(`/sites/${alert.site_id}`)}
                    >
                      {alert.site_name || 'Unknown Site'}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={alert.severity.toUpperCase()}
                      color={
                        alert.severity === 'critical'
                          ? 'error'
                          : alert.severity === 'high'
                          ? 'warning'
                          : alert.severity === 'medium'
                          ? 'default'
                          : 'info'
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={alert.enabled}
                          onChange={() => handleToggleEnabled(alert.id, alert.enabled)}
                          size="small"
                        />
                      }
                      label={alert.enabled ? 'Enabled' : 'Disabled'}
                    />
                  </TableCell>
                  <TableCell>
                    {alert.last_triggered_relative || 'Never'}
                  </TableCell>
                  <TableCell>
                    {alert.active_event_count ? (
                      <Chip
                        label={alert.active_event_count}
                        color="error"
                        size="small"
                      />
                    ) : (
                      '0'
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleAcknowledge(alert.id)}
                      title="Acknowledge"
                    >
                      <AcknowledgeIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => navigate(`/sites/${alert.site_id}`)}
                      title="View Site"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(alert.id)}
                      title="Delete"
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create Alert Dialog */}
      <CreateAlertForm
        open={createDialogOpen}
        siteId={selectedSiteForAlert}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['all-alerts'] });
        }}
      />
    </Container>
  );
};

export default AlertManagement;
