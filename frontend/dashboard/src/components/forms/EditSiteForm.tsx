import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Typography,
  Alert,
  Autocomplete,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { COUNTRIES } from '../../utils/countries';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface Site {
  id: string;
  name: string;
  type: 'solar' | 'wind' | 'hybrid' | string;
  latitude: number;
  longitude: number;
  capacity_mw: number;
  timezone: string;
  pv_params?: any;
  turbine_params?: any;
}

interface EditSiteFormProps {
  open: boolean;
  site: Site | null;
  onClose: () => void;
  onSuccess?: () => void;
}

interface SiteFormData {
  name: string;
  type: 'solar' | 'wind' | 'hybrid';
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  latitude: string;
  longitude: string;
  capacity_mw: string;
  timezone: string;
  // Solar-specific
  tilt: string;
  azimuth: string;
  module_type: string;
  system_loss: string;
  efficiency: string;
  // Wind-specific
  hub_height: string;
  rotor_diameter: string;
  cut_in_speed: string;
  rated_speed: string;
  cut_out_speed: string;
}

const EditSiteForm: React.FC<EditSiteFormProps> = ({ open, site, onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<SiteFormData>({
    name: '',
    type: 'solar',
    address: '',
    city: '',
    state: '',
    postcode: '',
    country: '',
    latitude: '',
    longitude: '',
    capacity_mw: '',
    timezone: 'UTC',
    tilt: '30',
    azimuth: '180',
    module_type: 'mono-Si',
    system_loss: '0.14',
    efficiency: '0.18',
    hub_height: '80',
    rotor_diameter: '60',
    cut_in_speed: '3',
    rated_speed: '12',
    cut_out_speed: '25',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // Populate form when site changes
  useEffect(() => {
    if (site && open) {
      setFormData({
        name: site.name || '',
        type: (site.type === 'solar' || site.type === 'wind' || site.type === 'hybrid' ? site.type : 'solar') as 'solar' | 'wind' | 'hybrid',
        address: '',
        city: '',
        state: '',
        postcode: '',
        country: '',
        latitude: site.latitude?.toString() || '',
        longitude: site.longitude?.toString() || '',
        capacity_mw: site.capacity_mw?.toString() || '',
        timezone: site.timezone || 'UTC',
        tilt: site.pv_params?.tilt?.toString() || '30',
        azimuth: site.pv_params?.azimuth?.toString() || '180',
        module_type: site.pv_params?.module_type || 'mono-Si',
        system_loss: site.pv_params?.system_loss?.toString() || '0.14',
        efficiency: site.pv_params?.efficiency?.toString() || '0.18',
        hub_height: site.turbine_params?.hub_height?.toString() || '80',
        rotor_diameter: site.turbine_params?.rotor_diameter?.toString() || '60',
        cut_in_speed: site.turbine_params?.cut_in_speed?.toString() || '3',
        rated_speed: site.turbine_params?.rated_speed?.toString() || '12',
        cut_out_speed: site.turbine_params?.cut_out_speed?.toString() || '25',
      });
      setError('');
    }
  }, [site, open]);

  const handleChange = (field: keyof SiteFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData({ ...formData, [field]: e.target.value });
    setError('');
  };

  const handleGeocode = async () => {
    if (!formData.address && !formData.city && !formData.postcode && !formData.country) {
      setError('Please enter at least an address, city, postcode, or country');
      return;
    }

    setGeocoding(true);
    setError('');

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await axios.post(
        `${API_URL}/v1/geocode`,
        {
          address: formData.address || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          postcode: formData.postcode || undefined,
          country: formData.country || undefined,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        const lat = response.data.latitude;
        const lon = response.data.longitude;
        setFormData({
          ...formData,
          latitude: lat.toString(),
          longitude: lon.toString(),
        });
      } else {
        setError(response.data.message || 'Geocoding failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Geocoding failed');
    } finally {
      setGeocoding(false);
    }
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('Site name is required');
      return false;
    }
    if (!formData.latitude || !formData.longitude) {
      setError('Latitude and longitude are required');
      return false;
    }
    const lat = parseFloat(formData.latitude);
    const lon = parseFloat(formData.longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError('Latitude must be between -90 and 90');
      return false;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setError('Longitude must be between -180 and 180');
      return false;
    }
    if (!formData.capacity_mw) {
      setError('Capacity is required');
      return false;
    }
    const capacity = parseFloat(formData.capacity_mw);
    if (isNaN(capacity) || capacity <= 0 || capacity > 1000) {
      setError('Capacity must be between 0 and 1000 MW');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Build update payload
      const updateData: any = {
        name: formData.name,
        capacity_mw: parseFloat(formData.capacity_mw),
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        timezone: formData.timezone,
      };

      // Add type if changed
      if (formData.type !== site?.type) {
        updateData.type = formData.type;
      }

      // Add site-specific parameters
      if (formData.type === 'solar') {
        updateData.pv_params = {
          tilt: parseFloat(formData.tilt),
          azimuth: parseFloat(formData.azimuth),
          module_type: formData.module_type,
          system_loss: parseFloat(formData.system_loss),
          efficiency: parseFloat(formData.efficiency),
        };
      } else if (formData.type === 'wind') {
        updateData.turbine_params = {
          hub_height: parseFloat(formData.hub_height),
          rotor_diameter: parseFloat(formData.rotor_diameter),
          cut_in_speed: parseFloat(formData.cut_in_speed),
          rated_speed: parseFloat(formData.rated_speed),
          cut_out_speed: parseFloat(formData.cut_out_speed),
        };
      }

      await axios.put(
        `${API_URL}/v1/sites/${site?.id}`,
        updateData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['site', site?.id] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to update site';
      setError(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!site) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Site: {site.name}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
          <Tab label="Basic Info" />
          <Tab label={formData.type === 'solar' ? 'PV Parameters' : 'Turbine Parameters'} />
        </Tabs>

        {activeTab === 0 && (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Site Name"
                value={formData.name}
                onChange={handleChange('name')}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Site Type"
                value={formData.type}
                onChange={handleChange('type')}
                required
              >
                <MenuItem value="solar">Solar</MenuItem>
                <MenuItem value="wind">Wind</MenuItem>
                <MenuItem value="hybrid">Hybrid</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Capacity (MW)"
                type="number"
                value={formData.capacity_mw}
                onChange={handleChange('capacity_mw')}
                required
                inputProps={{ min: 0, max: 1000, step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Location
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Address"
                value={formData.address}
                onChange={handleChange('address')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="City"
                value={formData.city}
                onChange={handleChange('city')}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="State/Province"
                value={formData.state}
                onChange={handleChange('state')}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Postcode/ZIP"
                value={formData.postcode}
                onChange={handleChange('postcode')}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Autocomplete
                options={COUNTRIES}
                getOptionLabel={(option) => {
                  if (typeof option === 'string') return option;
                  return option.name || '';
                }}
                value={COUNTRIES.find(c => c.name === formData.country) || null}
                onChange={(e, newValue) => {
                  setFormData({
                    ...formData,
                    country: newValue ? (typeof newValue === 'string' ? newValue : newValue.name || '') : '',
                  });
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Country" fullWidth />
                )}
                freeSolo
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="outlined"
                onClick={handleGeocode}
                disabled={geocoding}
                sx={{ mb: 2 }}
              >
                {geocoding ? <CircularProgress size={20} /> : 'Get Coordinates from Address'}
              </Button>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Latitude"
                type="number"
                value={formData.latitude}
                onChange={handleChange('latitude')}
                required
                inputProps={{ min: -90, max: 90, step: 0.000001 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Longitude"
                type="number"
                value={formData.longitude}
                onChange={handleChange('longitude')}
                required
                inputProps={{ min: -180, max: 180, step: 0.000001 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Timezone"
                value={formData.timezone}
                onChange={handleChange('timezone')}
                required
              />
            </Grid>
          </Grid>
        )}

        {activeTab === 1 && formData.type === 'solar' && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Tilt Angle (degrees)"
                type="number"
                value={formData.tilt}
                onChange={handleChange('tilt')}
                inputProps={{ min: 0, max: 90, step: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Azimuth (degrees)"
                type="number"
                value={formData.azimuth}
                onChange={handleChange('azimuth')}
                inputProps={{ min: 0, max: 360, step: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Module Type"
                value={formData.module_type}
                onChange={handleChange('module_type')}
              >
                <MenuItem value="mono-Si">Mono-Si</MenuItem>
                <MenuItem value="multi-Si">Multi-Si</MenuItem>
                <MenuItem value="thin-film">Thin-Film</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="System Loss"
                type="number"
                value={formData.system_loss}
                onChange={handleChange('system_loss')}
                inputProps={{ min: 0, max: 1, step: 0.01 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Efficiency"
                type="number"
                value={formData.efficiency}
                onChange={handleChange('efficiency')}
                inputProps={{ min: 0, max: 1, step: 0.01 }}
              />
            </Grid>
          </Grid>
        )}

        {activeTab === 1 && formData.type === 'wind' && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Hub Height (m)"
                type="number"
                value={formData.hub_height}
                onChange={handleChange('hub_height')}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Rotor Diameter (m)"
                type="number"
                value={formData.rotor_diameter}
                onChange={handleChange('rotor_diameter')}
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Cut-in Speed (m/s)"
                type="number"
                value={formData.cut_in_speed}
                onChange={handleChange('cut_in_speed')}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Rated Speed (m/s)"
                type="number"
                value={formData.rated_speed}
                onChange={handleChange('rated_speed')}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Cut-out Speed (m/s)"
                type="number"
                value={formData.cut_out_speed}
                onChange={handleChange('cut_out_speed')}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
          </Grid>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditSiteForm;

