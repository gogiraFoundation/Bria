import React, { useState } from 'react';
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
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { COUNTRIES } from '../../utils/countries';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface CreateSiteFormProps {
  open: boolean;
  onClose: () => void;
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
}

const CreateSiteForm: React.FC<CreateSiteFormProps> = ({ open, onClose }) => {
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
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

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
        
        // Ensure values are properly formatted as strings for the number inputs
        const latStr = typeof lat === 'number' ? lat.toString() : String(lat);
        const lonStr = typeof lon === 'number' ? lon.toString() : String(lon);
        
        setFormData(prev => ({
          ...prev,
          latitude: latStr,
          longitude: lonStr,
        }));
        // Clear any previous errors
        setError('');
      }
    } catch (err: any) {
      console.error('Geocoding error:', err);
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('Failed to geocode address. Please enter coordinates manually.');
      }
    } finally {
      setGeocoding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validate required fields first
    if (!formData.name.trim()) {
      setError('Site name is required');
      return;
    }
    if (!formData.capacity_mw || parseFloat(formData.capacity_mw) <= 0) {
      setError('Capacity must be greater than 0');
      return;
    }
    if (!formData.latitude || !formData.longitude) {
      setError('Latitude and longitude are required. Please use "Get Coordinates" or enter them manually.');
      return;
    }
    
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Validate form data
      const latitude = parseFloat(formData.latitude);
      const longitude = parseFloat(formData.longitude);
      const capacity = parseFloat(formData.capacity_mw);

      if (isNaN(latitude) || latitude < -90 || latitude > 90) {
        throw new Error('Latitude must be between -90 and 90');
      }
      if (isNaN(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('Longitude must be between -180 and 180');
      }
      if (isNaN(capacity) || capacity <= 0) {
        throw new Error('Capacity must be greater than 0');
      }

      // Prepare site data based on type
      const siteData: any = {
        name: formData.name,
        type: formData.type,
        latitude,
        longitude,
        capacity_mw: capacity,
        timezone: formData.timezone,
      };

      // Add type-specific parameters
      if (formData.type === 'solar') {
        siteData.pv_params = {
          module_type: 'mono-Si',
          tilt: 30,
          azimuth: 180,
          system_loss: 0.14,
        };
      } else if (formData.type === 'wind') {
        siteData.turbine_params = {
          hub_height: 100,
          rotor_diameter: 120,
          power_curve: 'standard',
        };
      }

      await axios.post(`${API_URL}/v1/sites`, siteData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Refresh sites list
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      
      // Reset form and close
      setFormData({
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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      onClose();
    } catch (err: any) {
      console.error('Error creating site:', err);
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
      } else {
        setError(err.message || 'Failed to create site');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>Create New Site</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 1 }}>
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
                inputProps={{ min: 0.1, step: 0.1 }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Location (Address or Coordinates)
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Address"
                value={formData.address}
                onChange={handleChange('address')}
                placeholder="Street address"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="City"
                value={formData.city}
                onChange={handleChange('city')}
                placeholder="City name"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="State/Province"
                value={formData.state}
                onChange={handleChange('state')}
                placeholder="State or province"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Postal/ZIP Code"
                value={formData.postcode}
                onChange={handleChange('postcode')}
                placeholder="Postal code"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Autocomplete
                options={COUNTRIES}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                value={COUNTRIES.find(c => c.name === formData.country) || null}
                onChange={(event, newValue) => {
                  setFormData({
                    ...formData,
                    country: newValue ? (typeof newValue === 'string' ? newValue : newValue.name) : '',
                  });
                  setError('');
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Country"
                    placeholder="Select or type country name"
                    required
                    inputProps={{
                      ...params.inputProps,
                      autoComplete: 'new-password', // disable autocomplete
                    }}
                  />
                )}
                freeSolo
                filterOptions={(options, params) => {
                  const filtered = options.filter((option) =>
                    option.name.toLowerCase().includes(params.inputValue.toLowerCase())
                  );
                  return filtered;
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="outlined"
                onClick={handleGeocode}
                disabled={geocoding || (!formData.address && !formData.city && !formData.postcode && !formData.country)}
                sx={{ mb: 2 }}
              >
                {geocoding ? 'Geocoding...' : 'Get Coordinates from Address'}
              </Button>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Or Enter Coordinates Manually
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Latitude"
                type="number"
                value={formData.latitude}
                onChange={handleChange('latitude')}
                inputProps={{ min: -90, max: 90, step: 0.0001 }}
                helperText={formData.latitude ? `Latitude: ${formData.latitude}` : "Between -90 and 90 (required)"}
                error={formData.latitude !== '' && (isNaN(parseFloat(formData.latitude)) || parseFloat(formData.latitude) < -90 || parseFloat(formData.latitude) > 90)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Longitude"
                type="number"
                value={formData.longitude}
                onChange={handleChange('longitude')}
                inputProps={{ min: -180, max: 180, step: 0.0001 }}
                helperText={formData.longitude ? `Longitude: ${formData.longitude}` : "Between -180 and 180 (required)"}
                error={formData.longitude !== '' && (isNaN(parseFloat(formData.longitude)) || parseFloat(formData.longitude) < -180 || parseFloat(formData.longitude) > 180)}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Timezone"
                value={formData.timezone}
                onChange={handleChange('timezone')}
                required
                helperText="e.g., America/New_York, Europe/London"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            disabled={
              loading || 
              !formData.name.trim() || 
              !formData.capacity_mw || 
              !formData.latitude || 
              !formData.longitude ||
              isNaN(parseFloat(formData.latitude)) ||
              isNaN(parseFloat(formData.longitude)) ||
              isNaN(parseFloat(formData.capacity_mw))
            }
          >
            {loading ? 'Creating...' : 'Create Site'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CreateSiteForm;

