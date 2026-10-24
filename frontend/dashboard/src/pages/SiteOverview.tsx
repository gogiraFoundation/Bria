import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  CardActionArea,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import CreateSiteFormEnhanced from '../components/forms/CreateSiteFormEnhanced';
import { notificationService } from '../services/notificationService';
import PageHeader from '../components/ui/PageHeader';
import KpiStrip from '../components/ui/KpiStrip';
import EmptyState from '../components/ui/EmptyState';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface Site {
  id: string;
  name: string;
  type: string;
  capacity_mw: number;
  latitude?: number;
  longitude?: number;
  created_at?: string;
}

interface GroupedSites {
  grouped: boolean;
  group_by: string;
  groups: { [key: string]: Site[] };
  total: number;
}

const typeChipColor = (type: string): 'primary' | 'secondary' | 'default' => {
  if (type === 'solar') return 'primary';
  if (type === 'wind' || type === 'hybrid') return 'secondary';
  return 'default';
};

const SiteOverview: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [groupBy, setGroupBy] = useState<string>('none');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<string>('desc');

  const { data: sitesData, isLoading, error } = useQuery<Site[] | GroupedSites>({
    queryKey: ['sites', groupBy, sortBy, sortOrder],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('No authentication token');
      }
      const params: Record<string, string> = {};
      if (groupBy !== 'none') {
        params.group_by = groupBy;
      }
      if (sortBy) {
        params.sort_by = sortBy;
      }
      if (sortOrder) {
        params.sort_order = sortOrder;
      }
      const response = await axios.get(`${API_URL}/v1/sites`, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data || [];
    },
    retry: 1,
  });

  const isGrouped = Boolean(
    sitesData && typeof sitesData === 'object' && 'grouped' in sitesData && sitesData.grouped
  );
  const groupedData = isGrouped ? (sitesData as GroupedSites) : null;
  const sites = useMemo(
    () => (isGrouped ? [] : ((sitesData as Site[]) || [])),
    [isGrouped, sitesData]
  );

  const flatSites = useMemo(() => {
    if (isGrouped && groupedData) {
      return Object.values(groupedData.groups).flat();
    }
    return sites;
  }, [isGrouped, groupedData, sites]);

  const kpiItems = useMemo(() => {
    const count = isGrouped && groupedData ? groupedData.total : flatSites.length;
    const totalMw = flatSites.reduce((sum, s) => sum + (Number(s.capacity_mw) || 0), 0);
    return [
      { label: 'Sites', value: count },
      {
        label: 'Total capacity',
        value: `${totalMw.toLocaleString(undefined, { maximumFractionDigits: 1 })} MW`,
        tone: 'renewable' as const,
      },
    ];
  }, [flatSites, isGrouped, groupedData]);

  const handleDeleteClick = (e: React.MouseEvent, site: Site) => {
    e.stopPropagation();
    setSiteToDelete(site);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!siteToDelete) return;

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      await axios.delete(`${API_URL}/v1/sites/${siteToDelete.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      notificationService.success(`Site "${siteToDelete.name}" deleted successfully`);
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['forecast'] });
      setDeleteDialogOpen(false);
      setSiteToDelete(null);
    } catch (err: any) {
      console.error('Error deleting site:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to delete site';
      notificationService.error(errorMessage);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSiteToDelete(null);
  };

  const renderSiteCard = (site: Site) => (
    <Grid item xs={12} sm={6} md={4} key={site.id}>
      <Card sx={{ position: 'relative' }}>
        <CardActionArea onClick={() => navigate(`/sites/${site.id}`)}>
          <CardContent sx={{ pr: 6 }}>
            <Typography variant="h6" noWrap>
              {site.name}
            </Typography>
            <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={site.type.toUpperCase()}
                size="small"
                color={typeChipColor(site.type)}
              />
              <Chip
                label={`${site.capacity_mw} MW`}
                size="small"
                variant="outlined"
              />
            </Box>
          </CardContent>
        </CardActionArea>
        <IconButton
          size="small"
          color="error"
          onClick={(e) => handleDeleteClick(e, site)}
          aria-label={`Delete ${site.name}`}
          sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
        >
          <DeleteIcon />
        </IconButton>
      </Card>
    </Grid>
  );

  if (isLoading) {
    return (
      <Box>
        <PageHeader title="Sites" subtitle="Renewable generation sites" />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <PageHeader title="Sites" />
        <Alert severity="error">
          Error loading sites: {(error as any)?.message || String(error) || 'Unknown error'}
        </Alert>
      </Box>
    );
  }

  const hasNoSites = !isGrouped && (!sites || sites.length === 0);

  return (
    <Box>
      <PageHeader
        title="Sites"
        subtitle="Renewable generation sites"
        primaryAction={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={() => navigate('/plan')}>
              Plan technology
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
              Add site
            </Button>
          </Box>
        }
      />

      {!hasNoSites && <KpiStrip items={kpiItems} />}

      {!hasNoSites && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 180 }} size="small">
            <InputLabel>Group by</InputLabel>
            <Select
              value={groupBy}
              label="Group by"
              onChange={(e) => setGroupBy(e.target.value)}
            >
              <MenuItem value="none">No grouping</MenuItem>
              <MenuItem value="technology">Technology</MenuItem>
              <MenuItem value="location">Location</MenuItem>
              <MenuItem value="output">Output (capacity)</MenuItem>
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 180 }} size="small">
            <InputLabel>Sort by</InputLabel>
            <Select value={sortBy} label="Sort by" onChange={(e) => setSortBy(e.target.value)}>
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="type">Technology</MenuItem>
              <MenuItem value="capacity_mw">Capacity</MenuItem>
              <MenuItem value="created_at">Date created</MenuItem>
              <MenuItem value="latitude">Latitude</MenuItem>
              <MenuItem value="longitude">Longitude</MenuItem>
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 120 }} size="small">
            <InputLabel>Order</InputLabel>
            <Select
              value={sortOrder}
              label="Order"
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <MenuItem value="asc">Ascending</MenuItem>
              <MenuItem value="desc">Descending</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}

      {hasNoSites ? (
        <EmptyState
          icon={<PlaceOutlinedIcon fontSize="inherit" />}
          title="No sites yet"
          body="Create your first renewable generation site to start forecasting."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
              Add site
            </Button>
          }
        />
      ) : isGrouped && groupedData ? (
        <Box>
          {Object.entries(groupedData.groups).map(([groupKey, groupSites]) => (
            <Accordion key={groupKey} defaultExpanded disableGutters elevation={0} sx={{ mb: 1, border: 1, borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  <Typography variant="h6">{groupKey}</Typography>
                  <Chip
                    label={`${groupSites.length} site${groupSites.length !== 1 ? 's' : ''}`}
                    size="small"
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {groupSites.map((site) => renderSiteCard(site))}
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      ) : (
        <Grid container spacing={2}>
          {sites.map((site) => renderSiteCard(site))}
        </Grid>
      )}

      <CreateSiteFormEnhanced
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete site</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete the site &quot;{siteToDelete?.name}&quot;?
            This cannot be undone and will also delete associated forecasts, alerts, and
            historical data.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SiteOverview;
