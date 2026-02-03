import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import CreateSiteFormEnhanced from '../components/forms/CreateSiteFormEnhanced';
import { notificationService } from '../services/notificationService';

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
      const params: any = {};
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
  
  // Check if data is grouped
  const isGrouped = sitesData && typeof sitesData === 'object' && 'grouped' in sitesData && sitesData.grouped;
  const sites = isGrouped ? [] : (sitesData as Site[] || []);
  const groupedData = isGrouped ? (sitesData as GroupedSites) : null;

  const handleDeleteClick = (e: React.MouseEvent, site: Site) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
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
      
      // Invalidate queries to refresh the list
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

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Sites Overview
        </Typography>
        <Typography>Loading sites...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Sites Overview
        </Typography>
        <Typography color="error">
          Error loading sites: {(error as any)?.message || String(error) || 'Unknown error'}
        </Typography>
      </Container>
    );
  }

  const renderSiteCard = (site: Site) => (
    <Grid item xs={12} sm={6} md={4} key={site.id}>
      <Card>
        <CardActionArea onClick={() => navigate(`/sites/${site.id}`)}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6">{site.name}</Typography>
                <Typography color="textSecondary" sx={{ mt: 1 }}>
                  Type: {site.type} | Capacity: {site.capacity_mw} MW
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                  Click to view details and forecasts
                </Typography>
              </Box>
              <IconButton
                size="small"
                color="error"
                onClick={(e) => handleDeleteClick(e, site)}
                sx={{ ml: 1 }}
                aria-label="Delete site"
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>
    </Grid>
  );

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Sites Overview
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Add Site
        </Button>
      </Box>
      
      {/* Grouping and Sorting Controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel>Group By</InputLabel>
          <Select
            value={groupBy}
            label="Group By"
            onChange={(e) => setGroupBy(e.target.value)}
          >
            <MenuItem value="none">No Grouping</MenuItem>
            <MenuItem value="technology">Technology</MenuItem>
            <MenuItem value="location">Location</MenuItem>
            <MenuItem value="output">Output (Capacity)</MenuItem>
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel>Sort By</InputLabel>
          <Select
            value={sortBy}
            label="Sort By"
            onChange={(e) => setSortBy(e.target.value)}
          >
            <MenuItem value="name">Name</MenuItem>
            <MenuItem value="type">Technology</MenuItem>
            <MenuItem value="capacity_mw">Capacity</MenuItem>
            <MenuItem value="created_at">Date Created</MenuItem>
            <MenuItem value="latitude">Latitude</MenuItem>
            <MenuItem value="longitude">Longitude</MenuItem>
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 120 }}>
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
      
      {isLoading ? (
        <Typography>Loading sites...</Typography>
      ) : error ? (
        <Typography color="error">
          Error loading sites: {(error as any)?.message || String(error) || 'Unknown error'}
        </Typography>
      ) : isGrouped && groupedData ? (
        // Render grouped sites
        <Box>
          {Object.entries(groupedData.groups).map(([groupKey, groupSites]) => (
            <Accordion key={groupKey} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  <Typography variant="h6">{groupKey}</Typography>
                  <Chip label={`${groupSites.length} site${groupSites.length !== 1 ? 's' : ''}`} size="small" />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={3}>
                  {groupSites.map((site) => renderSiteCard(site))}
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      ) : !sites || sites.length === 0 ? (
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No sites found
          </Typography>
          <Typography color="textSecondary" sx={{ mb: 2 }}>
            Create your first renewable energy site to get started with forecasting.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Your First Site
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3}>
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
        <DialogTitle id="delete-dialog-title">
          Delete Site
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete the site "{siteToDelete?.name}"? 
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

export default SiteOverview;

