import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Alert,
  Button,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ForecastChart from '../components/charts/ForecastChartSimple';
import ForecastComparisonChart from '../components/charts/ForecastComparisonChart';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface Site {
  id: string;
  name: string;
  type: string;
  capacity_mw: number;
  latitude: number;
  longitude: number;
}

const ForecastsOverview: React.FC = () => {
  const navigate = useNavigate();
  // const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null); // Reserved for future use
  const [viewMode, setViewMode] = useState<'overview' | 'comparison'>('overview');
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [techFilter, setTechFilter] = useState<'all' | 'solar' | 'wind'>('all');
  const [comparisonHorizon, setComparisonHorizon] = useState<number>(24);

  const { data: sites, isLoading, error } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('No authentication token');
      }
      const response = await axios.get(`${API_URL}/v1/sites`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data || [];
    },
    retry: 1,
  });

  // Filter sites by technology - must be called before early returns (hooks rule)
  const filteredSites = useMemo(() => {
    if (!sites) return [];
    if (techFilter === 'all') return sites;
    return sites.filter((site: Site) => site.type === techFilter);
  }, [sites, techFilter]);

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading forecasts...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">
          Error loading sites: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      </Container>
    );
  }

  const handleSiteToggle = (siteId: string) => {
    setSelectedSites(prev => 
      prev.includes(siteId) 
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  const handleSelectAll = () => {
    if (selectedSites.length === filteredSites.length) {
      setSelectedSites([]);
    } else {
      setSelectedSites(filteredSites.map((s: Site) => s.id));
    }
  };

  if (!sites || sites.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Forecasts Overview
        </Typography>
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No sites found
          </Typography>
          <Typography color="textSecondary" sx={{ mb: 2 }}>
            Create a site to view forecasts.
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate('/')}
          >
            Go to Sites
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Forecasts Overview
        </Typography>
        <Button
          variant={viewMode === 'comparison' ? 'contained' : 'outlined'}
          startIcon={<CompareArrowsIcon />}
          onClick={() => setViewMode(viewMode === 'overview' ? 'comparison' : 'overview')}
        >
          {viewMode === 'overview' ? 'Compare Forecasts' : 'Back to Overview'}
        </Button>
      </Box>

      <Tabs value={viewMode === 'overview' ? 0 : 1} onChange={(_: React.SyntheticEvent, val: number) => setViewMode(val === 0 ? 'overview' : 'comparison')} sx={{ mb: 3 }}>
        <Tab label="Overview" />
        <Tab label="Comparison" />
      </Tabs>

      {viewMode === 'overview' ? (
        <>
          <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Technology</InputLabel>
              <Select
                value={techFilter}
                label="Technology"
                onChange={(e: any) => setTechFilter(e.target.value as 'all' | 'solar' | 'wind')}
              >
                <MenuItem value="all">All Technologies</MenuItem>
                <MenuItem value="solar">Solar Only</MenuItem>
                <MenuItem value="wind">Wind Only</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="body2" color="textSecondary">
              {filteredSites.length} site{filteredSites.length !== 1 ? 's' : ''} found
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {filteredSites.map((site) => (
              <Grid item xs={12} key={site.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Box>
                        <Typography variant="h6">{site.name}</Typography>
                        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                          <Chip
                            label={site.type.toUpperCase()}
                            size="small"
                            color={site.type === 'solar' ? 'primary' : site.type === 'wind' ? 'secondary' : 'default'}
                          />
                          <Chip label={`${site.capacity_mw} MW`} size="small" variant="outlined" />
                        </Box>
                      </Box>
                      <Button
                        variant="outlined"
                        startIcon={<TrendingUpIcon />}
                        onClick={() => navigate(`/sites/${site.id}`)}
                      >
                        View Details
                      </Button>
                    </Box>
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                        24-Hour Forecast
                      </Typography>
                      <ForecastChart siteId={site.id} horizon={24} showConfidence={true} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      ) : (
        <>
          <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Technology</InputLabel>
              <Select
                value={techFilter}
                label="Technology"
                onChange={(e: any) => {
                  setTechFilter(e.target.value as 'all' | 'solar' | 'wind');
                  setSelectedSites([]); // Clear selection when filter changes
                }}
              >
                <MenuItem value="all">All Technologies</MenuItem>
                <MenuItem value="solar">Solar Only</MenuItem>
                <MenuItem value="wind">Wind Only</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Horizon</InputLabel>
              <Select
                value={comparisonHorizon}
                label="Horizon"
                onChange={(e: any) => setComparisonHorizon(Number(e.target.value))}
              >
                <MenuItem value={24}>24 Hours</MenuItem>
                <MenuItem value={48}>48 Hours</MenuItem>
                <MenuItem value={168}>7 Days</MenuItem>
                <MenuItem value={720}>30 Days</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              size="small"
              onClick={handleSelectAll}
            >
              {selectedSites.length === filteredSites.length ? 'Deselect All' : 'Select All'}
            </Button>
            <Typography variant="body2" color="textSecondary">
              {selectedSites.length} site{selectedSites.length !== 1 ? 's' : ''} selected
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} md={selectedSites.length > 0 ? 8 : 12}>
              {selectedSites.length > 0 ? (
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Forecast Comparison
                    </Typography>
                    <ForecastComparisonChart
                      siteIds={selectedSites}
                      horizon={comparisonHorizon}
                      showConfidence={true}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent>
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                      <CompareArrowsIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                      <Typography variant="h6" color="textSecondary" gutterBottom>
                        Select Sites to Compare
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Choose sites from the list below to compare their forecasts
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Grid>

            <Grid item xs={12} md={selectedSites.length > 0 ? 4 : 12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Select Sites ({filteredSites.length})
                  </Typography>
                  <Box sx={{ maxHeight: '600px', overflowY: 'auto' }}>
                    {filteredSites.map((site: Site) => (
                      <FormControlLabel
                        key={site.id}
                        control={
                          <Checkbox
                            checked={selectedSites.includes(site.id)}
                            onChange={() => handleSiteToggle(site.id)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body1">{site.name}</Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                              <Chip
                                label={site.type.toUpperCase()}
                                size="small"
                                color={site.type === 'solar' ? 'primary' : site.type === 'wind' ? 'secondary' : 'default'}
                              />
                              <Chip label={`${site.capacity_mw} MW`} size="small" variant="outlined" />
                            </Box>
                          </Box>
                        }
                        sx={{ display: 'flex', mb: 1, width: '100%' }}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Container>
  );
};

export default ForecastsOverview;

