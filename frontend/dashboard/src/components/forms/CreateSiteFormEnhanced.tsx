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
  Tabs,
  Tab,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  Card,
  CardContent,
  Tooltip,
  Chip,
  Divider,
  Paper,
  Stack,
} from '@mui/material';
import {
  Map as MapIcon,
  MyLocation as MyLocationIcon,
} from '@mui/icons-material';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { COUNTRIES } from '../../utils/countries';
import { MapContainer, TileLayer, Marker, useMapEvents, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { notificationService } from '../../services/notificationService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CreateSiteFormEnhancedProps {
  open: boolean;
  onClose: () => void;
}

interface SiteFormData {
  // Basic Info
  name: string;
  type: 'solar' | 'wind' | 'hybrid';
  capacity_mw: string;
  description: string;
  tags: string[];
  status: 'planned' | 'commissioning' | 'operational' | 'decommissioned';
  
  // Location
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  latitude: string;
  longitude: string;
  elevation: string;
  timezone: string;
  terrain_type: 'flat' | 'hilly' | 'mountainous';
  slope_angle: string;
  
  // Solar Parameters
  tilt: string;
  azimuth: string;
  module_type: string;
  system_loss: string;
  efficiency: string;
  inverter_efficiency: string;
  temp_coeff: string;
  noct: string;
  area: string;
  array_config: string;
  
  // Wind Parameters
  hub_height: string;
  rotor_diameter: string;
  cut_in_speed: string;
  rated_speed: string;
  cut_out_speed: string;
  num_turbines: string;
  wake_loss: string;
  air_density: string;
  
  // Equipment Inventory - Solar
  panel_manufacturer: string;
  panel_model: string;
  num_panels: string;
  inverter_manufacturer: string;
  inverter_model: string;
  string_config: string;
  monitoring_system: string;
  
  // Equipment Inventory - Wind
  turbine_manufacturer: string;
  turbine_model: string;
  gearbox_type: string;
  generator_specs: string;
  control_system: string;
  
  // Metadata
  commissioning_date: string;
  operational_lifetime: string;
  owner: string;
  operator: string;
  contact_email: string;
  contact_phone: string;
  
  // Financial & Commercial
  currency: string;
  ppa_rate: string;
  feed_in_tariff: string;
  energy_price: string;
  operating_costs: string;
  capex: string;
  revenue_sharing: string;
}

// Site Templates
const SITE_TEMPLATES = {
  'residential-solar': {
    name: 'Residential Solar',
    type: 'solar' as const,
    capacity_mw: '0.01',
    tilt: '30',
    azimuth: '180',
    module_type: 'mono-Si',
    efficiency: '0.20',
    system_loss: '0.14',
  },
  'commercial-solar': {
    name: 'Commercial Solar',
    type: 'solar' as const,
    capacity_mw: '0.5',
    tilt: '30',
    azimuth: '180',
    module_type: 'mono-Si',
    efficiency: '0.19',
    system_loss: '0.15',
  },
  'utility-solar': {
    name: 'Utility Solar',
    type: 'solar' as const,
    capacity_mw: '10',
    tilt: '25',
    azimuth: '180',
    module_type: 'mono-Si',
    efficiency: '0.18',
    system_loss: '0.14',
  },
  'small-wind': {
    name: 'Small Wind',
    type: 'wind' as const,
    capacity_mw: '0.5',
    hub_height: '50',
    rotor_diameter: '40',
    cut_in_speed: '3',
    rated_speed: '12',
    cut_out_speed: '25',
    num_turbines: '1',
  },
  'wind-farm': {
    name: 'Wind Farm',
    type: 'wind' as const,
    capacity_mw: '50',
    hub_height: '100',
    rotor_diameter: '120',
    cut_in_speed: '3',
    rated_speed: '12',
    cut_out_speed: '25',
    num_turbines: '25',
    wake_loss: '0.10',
  },
};

const CreateSiteFormEnhanced: React.FC<CreateSiteFormEnhancedProps> = ({ open, onClose }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [mapPosition, setMapPosition] = useState<[number, number] | null>(null);
  const [fetchingElevation, setFetchingElevation] = useState(false);
  
  const [formData, setFormData] = useState<SiteFormData>({
    name: '',
    type: 'solar',
    capacity_mw: '',
    description: '',
    tags: [],
    status: 'planned',
    address: '',
    city: '',
    state: '',
    postcode: '',
    country: '',
    latitude: '',
    longitude: '',
    elevation: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    terrain_type: 'flat',
    slope_angle: '0',
    tilt: '30',
    azimuth: '180',
    module_type: 'mono-Si',
    system_loss: '0.14',
    efficiency: '0.18',
    inverter_efficiency: '0.96',
    temp_coeff: '-0.004',
    noct: '45',
    area: '1000',
    array_config: 'standard',
    hub_height: '80',
    rotor_diameter: '60',
    cut_in_speed: '3',
    rated_speed: '12',
    cut_out_speed: '25',
    num_turbines: '1',
    wake_loss: '0.05',
    air_density: '1.225',
    panel_manufacturer: '',
    panel_model: '',
    num_panels: '',
    inverter_manufacturer: '',
    inverter_model: '',
    string_config: '',
    monitoring_system: '',
    turbine_manufacturer: '',
    turbine_model: '',
    gearbox_type: '',
    generator_specs: '',
    control_system: '',
    commissioning_date: '',
    operational_lifetime: '25',
    owner: '',
    operator: '',
    contact_email: '',
    contact_phone: '',
    currency: 'USD',
    ppa_rate: '',
    feed_in_tariff: '',
    energy_price: '',
    operating_costs: '',
    capex: '',
    revenue_sharing: '',
  });
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // Auto-detect timezone from coordinates
  useEffect(() => {
    if (formData.latitude && formData.longitude) {
      const lat = parseFloat(formData.latitude);
      const lon = parseFloat(formData.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        // Update map position
        setMapPosition([lat, lon]);
        
        // Try to auto-detect timezone (simplified - would need timezone API)
        // For now, keep manual timezone input
      }
    }
  }, [formData.latitude, formData.longitude]);

  const handleChange = (field: keyof SiteFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: any } }
  ) => {
    const value = e.target.value;
    setFormData({ ...formData, [field]: value });
    setError('');
  };

  const handleTemplateSelect = (templateKey: keyof typeof SITE_TEMPLATES) => {
    const template = SITE_TEMPLATES[templateKey];
    setFormData({
      ...formData,
      ...template,
      capacity_mw: template.capacity_mw,
    });
    notificationService.info(`Template "${template.name}" applied`);
  };

  const handleGeocode = async () => {
    // Check if at least one field is filled
    const hasAddress = formData.address && formData.address.trim() !== '';
    const hasCity = formData.city && formData.city.trim() !== '';
    const hasPostcode = formData.postcode && formData.postcode.trim() !== '';
    const hasCountry = formData.country && formData.country.trim() !== '';
    
    if (!hasAddress && !hasCity && !hasPostcode && !hasCountry) {
      const errorMsg = 'Please enter at least an address, city, postcode, or country';
      setError(errorMsg);
      notificationService.error(errorMsg);
      return;
    }

    setGeocoding(true);
    setError('');

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      // Extract country name if it's an object
      let countryValue: string | undefined = undefined;
      if (formData.country) {
        if (typeof formData.country === 'string') {
          countryValue = formData.country.trim() || undefined;
        } else if (formData.country && typeof formData.country === 'object' && 'name' in formData.country) {
          countryValue = (formData.country as any).name?.trim() || undefined;
        }
      }

      console.log('Geocoding request:', {
        address: formData.address || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        postcode: formData.postcode || undefined,
        country: countryValue,
      });

      const response = await axios.post(
        `${API_URL}/v1/geocode`,
        {
          address: formData.address?.trim() || undefined,
          city: formData.city?.trim() || undefined,
          state: formData.state?.trim() || undefined,
          postcode: formData.postcode?.trim() || undefined,
          country: countryValue,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Geocoding response:', response.data);

      // Handle both response formats: with success flag or direct coordinates
      const responseData = response.data;
      const hasSuccess = responseData && responseData.success === true;
      const hasCoordinates = responseData && 
                             typeof responseData.latitude === 'number' && 
                             typeof responseData.longitude === 'number';
      
      if (hasSuccess || hasCoordinates) {
        const lat = parseFloat(responseData.latitude);
        const lon = parseFloat(responseData.longitude);
        
        console.log('Parsed coordinates:', { lat, lon, isNaNLat: isNaN(lat), isNaNLon: isNaN(lon) });
        
        if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
          // Format to 6 decimal places for precision
          const latStr = lat.toFixed(6);
          const lonStr = lon.toFixed(6);
          
          console.log('Setting coordinates:', { 
            lat: lat, 
            lon: lon, 
            latStr, 
            lonStr,
            currentFormData: formData 
          });
          
          // Update state immediately
          setFormData(prev => {
            const updated = {
              ...prev,
              latitude: latStr,
              longitude: lonStr,
            };
            console.log('Updated formData in setState:', updated);
            return updated;
          });
          
          // Update map position
          setMapPosition([lat, lon]);
          
          // Fetch elevation asynchronously (don't await to avoid blocking)
          fetchElevation(lat, lon).catch(err => {
            console.warn('Failed to fetch elevation:', err);
          });
          
          notificationService.success(`Coordinates retrieved: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
          
          // Force a second update after a brief delay to ensure UI updates
          setTimeout(() => {
            setFormData(prev => {
              // Double-check and re-apply if needed
              if (prev.latitude !== latStr || prev.longitude !== lonStr) {
                console.log('Re-applying coordinates - state mismatch detected');
                return {
                  ...prev,
                  latitude: latStr,
                  longitude: lonStr,
                };
              }
              return prev;
            });
          }, 50);
        } else {
          throw new Error('Invalid coordinates received from server');
        }
      } else {
        throw new Error('Geocoding failed: No coordinates returned');
      }
    } catch (err: any) {
      console.error('Geocoding error:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      
      let errorMessage = 'Failed to geocode address. Please try again or enter coordinates manually.';
      
      if (err.response) {
        if (err.response.status === 401) {
          errorMessage = 'Authentication failed. Please log in again.';
        } else if (err.response.status === 404) {
          errorMessage = err.response.data?.detail || 'Address not found. Please check the address and try again.';
        } else if (err.response.data?.detail) {
          errorMessage = err.response.data.detail;
        } else if (err.response.data?.message) {
          errorMessage = err.response.data.message;
        }
      } else if (err.message) {
        errorMessage = err.message;
      } else if (err.request) {
        errorMessage = 'Cannot connect to server. Please check if the API Gateway is running.';
      }
      
      setError(errorMessage);
      notificationService.error(errorMessage);
    } finally {
      setGeocoding(false);
    }
  };

  const fetchElevation = async (lat: number, lon: number) => {
    setFetchingElevation(true);
    try {
      // Use OpenElevation API (free, no key required)
      const response = await axios.post('https://api.open-elevation.com/api/v1/lookup', {
        locations: [{ latitude: lat, longitude: lon }],
      });
      
      if (response.data.results && response.data.results.length > 0) {
        const elevation = response.data.results[0].elevation;
        setFormData({ ...formData, elevation: Math.round(elevation).toString() });
      }
    } catch (err) {
      console.warn('Failed to fetch elevation:', err);
      // Not critical, continue without elevation
    } finally {
      setFetchingElevation(false);
    }
  };

  const handleMapClick = (lat: number, lon: number) => {
    setFormData({
      ...formData,
      latitude: lat.toFixed(6),
      longitude: lon.toFixed(6),
    });
    setMapPosition([lat, lon]);
    fetchElevation(lat, lon);
  };

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setFormData({
            ...formData,
            latitude: lat.toFixed(6),
            longitude: lon.toFixed(6),
          });
          setMapPosition([lat, lon]);
          fetchElevation(lat, lon);
        },
        (error) => {
          notificationService.error('Failed to get current location');
        }
      );
    }
  };

  const calculateEstimatedGeneration = () => {
    if (!formData.capacity_mw || !formData.latitude) return null;
    
    const capacity = parseFloat(formData.capacity_mw);
    if (isNaN(capacity)) return null;
    
    // Simple estimation: assume 20% capacity factor for solar, 35% for wind
    const capacityFactor = formData.type === 'solar' ? 0.20 : 0.35;
    const annualGeneration = capacity * 1000 * capacityFactor * 8760; // kWh
    
    return {
      annualGeneration: Math.round(annualGeneration),
      capacityFactor: (capacityFactor * 100).toFixed(1),
    };
  };

  const estimatedGen = calculateEstimatedGeneration();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.name.trim()) {
      setError('Site name is required');
      return;
    }
    if (!formData.capacity_mw || parseFloat(formData.capacity_mw) <= 0) {
      setError('Capacity must be greater than 0');
      return;
    }
    if (!formData.latitude || !formData.longitude) {
      setError('Latitude and longitude are required');
      return;
    }
    
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');

      // Parse and validate coordinates
      const latitude = parseFloat(formData.latitude);
      const longitude = parseFloat(formData.longitude);
      const capacity = parseFloat(formData.capacity_mw);

      console.log('Submitting site with coordinates:', {
        rawLat: formData.latitude,
        rawLon: formData.longitude,
        parsedLat: latitude,
        parsedLon: longitude,
      });

      // Validate coordinate ranges
      if (isNaN(latitude) || isNaN(longitude)) {
        setError(`Invalid coordinates: lat=${formData.latitude}, lon=${formData.longitude}`);
        setLoading(false);
        return;
      }
      
      if (latitude < -90 || latitude > 90) {
        setError(`Invalid latitude: ${latitude}. Must be between -90 and 90.`);
        setLoading(false);
        return;
      }
      
      if (longitude < -180 || longitude > 180) {
        setError(`Invalid longitude: ${longitude}. Must be between -180 and 180.`);
        setLoading(false);
        return;
      }

      const siteData: any = {
        name: formData.name,
        type: formData.type,
        latitude: latitude,  // Ensure it's a number
        longitude: longitude,  // Ensure it's a number
        capacity_mw: capacity,
        timezone: formData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      
      console.log('Site data being sent:', {
        ...siteData,
        latitudeType: typeof siteData.latitude,
        longitudeType: typeof siteData.longitude,
      });

      // Add description if provided
      if (formData.description) {
        // Store in a metadata field (would need backend support)
      }

      // Add type-specific parameters
      if (formData.type === 'solar') {
        siteData.pv_params = {
          module_type: formData.module_type,
          tilt: parseFloat(formData.tilt),
          azimuth: parseFloat(formData.azimuth),
          system_loss: parseFloat(formData.system_loss),
          efficiency: parseFloat(formData.efficiency),
          inverter_efficiency: parseFloat(formData.inverter_efficiency),
          temp_coeff: parseFloat(formData.temp_coeff),
          noct: parseFloat(formData.noct),
          area: parseFloat(formData.area),
        };
      } else if (formData.type === 'wind') {
        siteData.turbine_params = {
          hub_height: parseFloat(formData.hub_height),
          rotor_diameter: parseFloat(formData.rotor_diameter),
          cut_in_speed: parseFloat(formData.cut_in_speed),
          rated_speed: parseFloat(formData.rated_speed),
          cut_out_speed: parseFloat(formData.cut_out_speed),
          num_turbines: parseInt(formData.num_turbines),
          wake_loss: parseFloat(formData.wake_loss),
          air_density: formData.air_density ? parseFloat(formData.air_density) : undefined,
        };
      }

      // Add terrain information if provided
      if (formData.terrain_type || formData.slope_angle) {
        if (!siteData.pv_params) siteData.pv_params = {};
        if (!siteData.turbine_params) siteData.turbine_params = {};
        const terrainData: any = {
          type: formData.terrain_type,
        };
        if (formData.slope_angle && parseFloat(formData.slope_angle) > 0) {
          terrainData.slope_angle = parseFloat(formData.slope_angle);
        }
        if (formData.type === 'solar') {
          siteData.pv_params.terrain = terrainData;
        } else {
          siteData.turbine_params.terrain = terrainData;
        }
      }

      // Add equipment information if provided (store in metadata)
      const equipment: any = {};
      if (formData.type === 'solar') {
        if (formData.panel_manufacturer) equipment.panel_manufacturer = formData.panel_manufacturer;
        if (formData.panel_model) equipment.panel_model = formData.panel_model;
        if (formData.num_panels) equipment.num_panels = parseInt(formData.num_panels);
        if (formData.inverter_manufacturer) equipment.inverter_manufacturer = formData.inverter_manufacturer;
        if (formData.inverter_model) equipment.inverter_model = formData.inverter_model;
        if (formData.string_config) equipment.string_config = formData.string_config;
        if (formData.monitoring_system) equipment.monitoring_system = formData.monitoring_system;
        if (formData.array_config) equipment.array_config = formData.array_config;
      } else if (formData.type === 'wind') {
        if (formData.turbine_manufacturer) equipment.turbine_manufacturer = formData.turbine_manufacturer;
        if (formData.turbine_model) equipment.turbine_model = formData.turbine_model;
        if (formData.gearbox_type) equipment.gearbox_type = formData.gearbox_type;
        if (formData.generator_specs) equipment.generator_specs = formData.generator_specs;
        if (formData.control_system) equipment.control_system = formData.control_system;
      }
      if (Object.keys(equipment).length > 0) {
        if (!siteData.pv_params) siteData.pv_params = {};
        if (!siteData.turbine_params) siteData.turbine_params = {};
        if (formData.type === 'solar') {
          siteData.pv_params.equipment = equipment;
        } else {
          siteData.turbine_params.equipment = equipment;
        }
      }

      // Add financial information if provided (store in metadata)
      const financial: any = {};
      if (formData.currency) financial.currency = formData.currency;
      if (formData.ppa_rate) financial.ppa_rate = parseFloat(formData.ppa_rate);
      if (formData.feed_in_tariff) financial.feed_in_tariff = parseFloat(formData.feed_in_tariff);
      if (formData.energy_price) financial.energy_price = parseFloat(formData.energy_price);
      if (formData.operating_costs) financial.operating_costs = parseFloat(formData.operating_costs);
      if (formData.capex) financial.capex = parseFloat(formData.capex);
      if (formData.revenue_sharing) financial.revenue_sharing = formData.revenue_sharing;
      if (Object.keys(financial).length > 0) {
        if (!siteData.pv_params) siteData.pv_params = {};
        if (!siteData.turbine_params) siteData.turbine_params = {};
        if (formData.type === 'solar') {
          siteData.pv_params.financial = financial;
        } else {
          siteData.turbine_params.financial = financial;
        }
      }

      // Add metadata
      const metadata: any = {};
      if (formData.description) metadata.description = formData.description;
      if (formData.tags.length > 0) metadata.tags = formData.tags;
      if (formData.status) metadata.status = formData.status;
      if (formData.commissioning_date) metadata.commissioning_date = formData.commissioning_date;
      if (formData.operational_lifetime) metadata.operational_lifetime = parseInt(formData.operational_lifetime);
      if (formData.owner) metadata.owner = formData.owner;
      if (formData.operator) metadata.operator = formData.operator;
      if (formData.contact_email) metadata.contact_email = formData.contact_email;
      if (formData.contact_phone) metadata.contact_phone = formData.contact_phone;
      if (Object.keys(metadata).length > 0) {
        // Store metadata in pv_params or turbine_params as JSONB
        if (!siteData.pv_params) siteData.pv_params = {};
        if (!siteData.turbine_params) siteData.turbine_params = {};
        if (formData.type === 'solar') {
          siteData.pv_params.metadata = metadata;
        } else {
          siteData.turbine_params.metadata = metadata;
        }
      }

      await axios.post(`${API_URL}/v1/sites`, siteData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      queryClient.invalidateQueries({ queryKey: ['sites'] });
      notificationService.success('Site created successfully');
      
      // Reset form
      setFormData({
        name: '',
        type: 'solar',
        capacity_mw: '',
        description: '',
        tags: [],
        status: 'planned',
        address: '',
        city: '',
        state: '',
        postcode: '',
        country: '',
        latitude: '',
        longitude: '',
        elevation: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        terrain_type: 'flat',
        slope_angle: '0',
        tilt: '30',
        azimuth: '180',
        module_type: 'mono-Si',
        system_loss: '0.14',
        efficiency: '0.18',
        inverter_efficiency: '0.96',
        temp_coeff: '-0.004',
        noct: '45',
        area: '1000',
        array_config: 'standard',
        hub_height: '80',
        rotor_diameter: '60',
        cut_in_speed: '3',
        rated_speed: '12',
        cut_out_speed: '25',
        num_turbines: '1',
        wake_loss: '0.05',
        air_density: '1.225',
        panel_manufacturer: '',
        panel_model: '',
        num_panels: '',
        inverter_manufacturer: '',
        inverter_model: '',
        string_config: '',
        monitoring_system: '',
        turbine_manufacturer: '',
        turbine_model: '',
        gearbox_type: '',
        generator_specs: '',
        control_system: '',
        commissioning_date: '',
        operational_lifetime: '25',
        owner: '',
        operator: '',
        contact_email: '',
        contact_phone: '',
        currency: 'USD',
        ppa_rate: '',
        feed_in_tariff: '',
        energy_price: '',
        operating_costs: '',
        capex: '',
        revenue_sharing: '',
      });
      setMapPosition(null);
      onClose();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || err.message);
      notificationService.error('Failed to create site');
    } finally {
      setLoading(false);
    }
  };

  // Map click handler component
  const MapClickHandler: React.FC<{ onClick: (lat: number, lon: number) => void }> = ({ onClick }) => {
    useMapEvents({
      click: (e) => {
        onClick(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Create New Site</Typography>
            <Box>
              <Tooltip title="Quick Templates">
                <Select
                  size="small"
                  value=""
                  displayEmpty
                  onChange={(e) => {
                    if (e.target.value) {
                      handleTemplateSelect(e.target.value as keyof typeof SITE_TEMPLATES);
                    }
                  }}
                  sx={{ minWidth: 150, mr: 1 }}
                >
                  <MenuItem value="" disabled>Load Template...</MenuItem>
                  <MenuItem value="residential-solar">Residential Solar</MenuItem>
                  <MenuItem value="commercial-solar">Commercial Solar</MenuItem>
                  <MenuItem value="utility-solar">Utility Solar</MenuItem>
                  <MenuItem value="small-wind">Small Wind</MenuItem>
                  <MenuItem value="wind-farm">Wind Farm</MenuItem>
                </Select>
              </Tooltip>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
            <Tab label="Basic Info" />
            <Tab label="Location" />
            <Tab label={formData.type === 'solar' ? 'PV Parameters' : 'Turbine Parameters'} />
            <Tab label="Equipment" />
            <Tab label="Financial" />
            <Tab label="Metadata" />
            <Tab label="Preview" />
          </Tabs>

          {/* Tab 1: Basic Info */}
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
                <FormControl fullWidth>
                  <InputLabel>Site Type</InputLabel>
                  <Select
                    value={formData.type}
                    label="Site Type"
                    onChange={(e) => handleChange('type')({ target: { value: e.target.value } })}
                  >
                    <MenuItem value="solar">Solar</MenuItem>
                    <MenuItem value="wind">Wind</MenuItem>
                    <MenuItem value="hybrid">Hybrid</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Capacity (MW)"
                  type="number"
                  value={formData.capacity_mw}
                  onChange={handleChange('capacity_mw')}
                  required
                  inputProps={{ min: 0.001, step: 0.001 }}
                  helperText={estimatedGen ? `Est. Annual: ${estimatedGen.annualGeneration.toLocaleString()} kWh (${estimatedGen.capacityFactor}% CF)` : ''}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  value={formData.description}
                  onChange={handleChange('description')}
                  multiline
                  rows={3}
                  placeholder="Optional: Describe the site, its purpose, or any special characteristics..."
                />
              </Grid>
              {estimatedGen && (
                <Grid item xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" gutterBottom>
                        Estimated Performance
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="textSecondary">
                            Annual Generation
                          </Typography>
                          <Typography variant="h6">
                            {estimatedGen.annualGeneration.toLocaleString()} kWh
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="textSecondary">
                            Capacity Factor
                          </Typography>
                          <Typography variant="h6">
                            {estimatedGen.capacityFactor}%
                          </Typography>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </Grid>
          )}

          {/* Tab 2: Location */}
          {activeTab === 1 && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<MapIcon />}
                    onClick={() => setShowMap(!showMap)}
                  >
                    {showMap ? 'Hide Map' : 'Show Map'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<MyLocationIcon />}
                    onClick={handleGetCurrentLocation}
                  >
                    Use Current Location
                  </Button>
                </Box>
              </Grid>

              {showMap && (
                <Grid item xs={12}>
                  <Box sx={{ height: 400, mb: 2, borderRadius: 1, overflow: 'hidden' }}>
                    {mapPosition ? (
                      <MapContainer
                        center={mapPosition}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={mapPosition}>
                          <Popup>
                            <strong>Selected Location</strong><br />
                            {formData.latitude}, {formData.longitude}
                          </Popup>
                        </Marker>
                        <MapClickHandler onClick={handleMapClick} />
                      </MapContainer>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <Typography color="textSecondary">
                          Enter coordinates or use geocoding to show map
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Grid>
              )}

              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Address
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
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleGeocode();
                  }}
                  disabled={
                    geocoding || 
                    (!formData.address?.trim() && 
                     !formData.city?.trim() && 
                     !formData.postcode?.trim() && 
                     !(formData.country && (typeof formData.country === 'string' ? formData.country.trim() : (formData.country as any)?.name?.trim())))
                  }
                  startIcon={geocoding ? <CircularProgress size={16} /> : <MapIcon />}
                >
                  {geocoding ? 'Geocoding...' : 'Get Coordinates from Address'}
                </Button>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Coordinates
                </Typography>
              </Grid>
              
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Latitude"
                  type="text"
                  key={`lat-${formData.latitude || 'empty'}`}
                  value={formData.latitude || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow numbers, decimal point, and minus sign
                    if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
                      setFormData(prev => ({ ...prev, latitude: value }));
                    }
                  }}
                  required
                  inputProps={{ 
                    inputMode: 'decimal',
                    pattern: '-?[0-9]*\\.?[0-9]*',
                  }}
                  helperText={formData.latitude ? `Value: ${formData.latitude}` : 'Enter latitude or use geocoding'}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Longitude"
                  type="text"
                  key={`lon-${formData.longitude || 'empty'}`}
                  value={formData.longitude || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow numbers, decimal point, and minus sign
                    if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
                      setFormData(prev => ({ ...prev, longitude: value }));
                    }
                  }}
                  required
                  inputProps={{ 
                    inputMode: 'decimal',
                    pattern: '-?[0-9]*\\.?[0-9]*',
                  }}
                  helperText={formData.longitude ? `Value: ${formData.longitude}` : 'Enter longitude or use geocoding'}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Elevation (m)"
                  type="number"
                  value={formData.elevation}
                  onChange={handleChange('elevation')}
                  InputProps={{
                    endAdornment: fetchingElevation ? <CircularProgress size={20} /> : null,
                  }}
                  helperText={formData.elevation ? `${formData.elevation} m above sea level` : 'Auto-fetched from coordinates'}
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
          )}

          {/* Tab 3: PV/Turbine Parameters */}
          {activeTab === 2 && formData.type === 'solar' && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Tilt Angle (degrees)"
                  type="number"
                  value={formData.tilt}
                  onChange={handleChange('tilt')}
                  inputProps={{ min: 0, max: 90, step: 1 }}
                  helperText="Panel tilt from horizontal (0-90°)"
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
                  helperText="Panel orientation (180° = South)"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Module Type</InputLabel>
                  <Select
                    value={formData.module_type}
                    label="Module Type"
                    onChange={(e) => handleChange('module_type')({ target: { value: e.target.value } })}
                  >
                    <MenuItem value="mono-Si">Mono-Si</MenuItem>
                    <MenuItem value="multi-Si">Multi-Si</MenuItem>
                    <MenuItem value="thin-film">Thin-Film</MenuItem>
                    <MenuItem value="CIGS">CIGS</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Module Efficiency"
                  type="number"
                  value={formData.efficiency}
                  onChange={handleChange('efficiency')}
                  inputProps={{ min: 0, max: 1, step: 0.01 }}
                  helperText="Panel efficiency (0-1)"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="System Loss"
                  type="number"
                  value={formData.system_loss}
                  onChange={handleChange('system_loss')}
                  inputProps={{ min: 0, max: 1, step: 0.01 }}
                  helperText="Total system losses (0-1)"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Inverter Efficiency"
                  type="number"
                  value={formData.inverter_efficiency}
                  onChange={handleChange('inverter_efficiency')}
                  inputProps={{ min: 0, max: 1, step: 0.01 }}
                  helperText="Inverter efficiency (0-1)"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Temperature Coefficient (%/°C)"
                  type="number"
                  value={formData.temp_coeff}
                  onChange={handleChange('temp_coeff')}
                  inputProps={{ step: 0.001 }}
                  helperText="Power loss per °C increase"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="NOCT (°C)"
                  type="number"
                  value={formData.noct}
                  onChange={handleChange('noct')}
                  inputProps={{ min: 0, step: 1 }}
                  helperText="Nominal Operating Cell Temperature"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Panel Area (m²)"
                  type="number"
                  value={formData.area}
                  onChange={handleChange('area')}
                  inputProps={{ min: 0, step: 1 }}
                  helperText="Total panel area"
                />
              </Grid>
            </Grid>
          )}

          {activeTab === 2 && formData.type === 'wind' && (
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
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Number of Turbines"
                  type="number"
                  value={formData.num_turbines}
                  onChange={handleChange('num_turbines')}
                  inputProps={{ min: 1, step: 1 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Wake Loss Factor"
                  type="number"
                  value={formData.wake_loss}
                  onChange={handleChange('wake_loss')}
                  inputProps={{ min: 0, max: 1, step: 0.01 }}
                  helperText="Power loss due to wake effects (0-1)"
                />
              </Grid>
            </Grid>
          )}

          {/* Tab 4: Equipment Inventory */}
          {activeTab === 3 && (
            <Grid container spacing={2}>
              {formData.type === 'solar' ? (
                <>
                  <Grid item xs={12}>
                    <Typography variant="h6" gutterBottom>
                      Solar Equipment
                    </Typography>
                    <Divider sx={{ mb: 2 }} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Panel Manufacturer"
                      value={formData.panel_manufacturer}
                      onChange={handleChange('panel_manufacturer')}
                      placeholder="e.g., SunPower, First Solar"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Panel Model"
                      value={formData.panel_model}
                      onChange={handleChange('panel_model')}
                      placeholder="Model number"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Number of Panels"
                      type="number"
                      value={formData.num_panels}
                      onChange={handleChange('num_panels')}
                      inputProps={{ min: 1, step: 1 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Inverter Manufacturer"
                      value={formData.inverter_manufacturer}
                      onChange={handleChange('inverter_manufacturer')}
                      placeholder="e.g., SMA, Fronius"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Inverter Model"
                      value={formData.inverter_model}
                      onChange={handleChange('inverter_model')}
                      placeholder="Model number"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="String Configuration"
                      value={formData.string_config}
                      onChange={handleChange('string_config')}
                      placeholder="e.g., 20 panels per string"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Monitoring System"
                      value={formData.monitoring_system}
                      onChange={handleChange('monitoring_system')}
                      placeholder="e.g., Enphase, SolarEdge"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Array Configuration</InputLabel>
                      <Select
                        value={formData.array_config}
                        label="Array Configuration"
                        onChange={(e) => handleChange('array_config')({ target: { value: e.target.value } })}
                      >
                        <MenuItem value="standard">Standard</MenuItem>
                        <MenuItem value="tracking">Tracking System</MenuItem>
                        <MenuItem value="fixed-tilt">Fixed Tilt</MenuItem>
                        <MenuItem value="bifacial">Bifacial</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </>
              ) : (
                <>
                  <Grid item xs={12}>
                    <Typography variant="h6" gutterBottom>
                      Wind Turbine Equipment
                    </Typography>
                    <Divider sx={{ mb: 2 }} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Turbine Manufacturer"
                      value={formData.turbine_manufacturer}
                      onChange={handleChange('turbine_manufacturer')}
                      placeholder="e.g., Vestas, Siemens Gamesa"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Turbine Model"
                      value={formData.turbine_model}
                      onChange={handleChange('turbine_model')}
                      placeholder="Model number"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Gearbox Type"
                      value={formData.gearbox_type}
                      onChange={handleChange('gearbox_type')}
                      placeholder="e.g., Direct Drive, Geared"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Generator Specifications"
                      value={formData.generator_specs}
                      onChange={handleChange('generator_specs')}
                      placeholder="Generator details"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Control System"
                      value={formData.control_system}
                      onChange={handleChange('control_system')}
                      placeholder="Control system type"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Air Density (kg/m³)"
                      type="number"
                      value={formData.air_density}
                      onChange={handleChange('air_density')}
                      inputProps={{ min: 0, step: 0.001 }}
                      helperText="Default: 1.225 kg/m³ at sea level"
                    />
                  </Grid>
                </>
              )}
            </Grid>
          )}

          {/* Tab 5: Financial & Commercial */}
          {activeTab === 4 && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Financial Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Currency</InputLabel>
                  <Select
                    value={formData.currency}
                    label="Currency"
                    onChange={(e) => handleChange('currency')({ target: { value: e.target.value } })}
                  >
                    <MenuItem value="USD">USD ($)</MenuItem>
                    <MenuItem value="EUR">EUR (€)</MenuItem>
                    <MenuItem value="GBP">GBP (£)</MenuItem>
                    <MenuItem value="JPY">JPY (¥)</MenuItem>
                    <MenuItem value="CNY">CNY (¥)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="PPA Rate"
                  type="number"
                  value={formData.ppa_rate}
                  onChange={handleChange('ppa_rate')}
                  placeholder="Price per MWh"
                  InputProps={{
                    endAdornment: <Typography sx={{ mr: 1 }}>{formData.currency}/MWh</Typography>,
                  }}
                  helperText="Power Purchase Agreement rate"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Feed-in Tariff Rate"
                  type="number"
                  value={formData.feed_in_tariff}
                  onChange={handleChange('feed_in_tariff')}
                  placeholder="Tariff rate"
                  InputProps={{
                    endAdornment: <Typography sx={{ mr: 1 }}>{formData.currency}/kWh</Typography>,
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Energy Price"
                  type="number"
                  value={formData.energy_price}
                  onChange={handleChange('energy_price')}
                  placeholder="Market price"
                  InputProps={{
                    endAdornment: <Typography sx={{ mr: 1 }}>{formData.currency}/kWh</Typography>,
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Operating Costs"
                  type="number"
                  value={formData.operating_costs}
                  onChange={handleChange('operating_costs')}
                  placeholder="Annual operating costs"
                  InputProps={{
                    endAdornment: <Typography sx={{ mr: 1 }}>{formData.currency}/year</Typography>,
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="CAPEX"
                  type="number"
                  value={formData.capex}
                  onChange={handleChange('capex')}
                  placeholder="Capital expenditure"
                  InputProps={{
                    endAdornment: <Typography sx={{ mr: 1 }}>{formData.currency}</Typography>,
                  }}
                  helperText="Total installation cost"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Revenue Sharing Model"
                  value={formData.revenue_sharing}
                  onChange={handleChange('revenue_sharing')}
                  placeholder="e.g., 70/30 split, Fixed fee"
                  helperText="Optional: Describe revenue sharing arrangement"
                />
              </Grid>
            </Grid>
          )}

          {/* Tab 6: Metadata */}
          {activeTab === 5 && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Site Status</InputLabel>
                  <Select
                    value={formData.status}
                    label="Site Status"
                    onChange={(e) => handleChange('status')({ target: { value: e.target.value } })}
                  >
                    <MenuItem value="planned">Planned</MenuItem>
                    <MenuItem value="commissioning">Commissioning</MenuItem>
                    <MenuItem value="operational">Operational</MenuItem>
                    <MenuItem value="decommissioned">Decommissioned</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Commissioning Date"
                  type="date"
                  value={formData.commissioning_date}
                  onChange={handleChange('commissioning_date')}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Expected Operational Lifetime (years)"
                  type="number"
                  value={formData.operational_lifetime}
                  onChange={handleChange('operational_lifetime')}
                  inputProps={{ min: 1, max: 50, step: 1 }}
                  helperText="Expected lifetime of the installation"
                />
              </Grid>
              <Grid item xs={12}>
                <Autocomplete
                  multiple
                  freeSolo
                  options={['Commercial', 'Utility', 'Residential', 'R&D', 'Industrial', 'Agricultural']}
                  value={formData.tags}
                  onChange={(e, newValue) => {
                    setFormData({ ...formData, tags: newValue });
                  }}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        variant="outlined"
                        label={option}
                        {...getTagProps({ index })}
                        key={index}
                      />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Tags/Categories"
                      placeholder="Add tags (e.g., Commercial, Utility)"
                      helperText="Press Enter to add a tag"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Owner"
                  value={formData.owner}
                  onChange={handleChange('owner')}
                  placeholder="Site owner name"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Operator"
                  value={formData.operator}
                  onChange={handleChange('operator')}
                  placeholder="Operating company"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Contact Email"
                  type="email"
                  value={formData.contact_email}
                  onChange={handleChange('contact_email')}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Contact Phone"
                  type="tel"
                  value={formData.contact_phone}
                  onChange={handleChange('contact_phone')}
                />
              </Grid>
            </Grid>
          )}

          {/* Tab 7: Preview & Validation */}
          {activeTab === 6 && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Site Preview & Validation
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              {/* Validation Status */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Validation Status
                    </Typography>
                    {(() => {
                      const errors: string[] = [];
                      const warnings: string[] = [];
                      
                      if (!formData.name.trim()) errors.push('Site name is required');
                      if (!formData.capacity_mw || parseFloat(formData.capacity_mw) <= 0) errors.push('Valid capacity is required');
                      if (!formData.latitude || !formData.longitude) errors.push('Coordinates are required');
                      if (formData.latitude && (parseFloat(formData.latitude) < -90 || parseFloat(formData.latitude) > 90)) errors.push('Invalid latitude');
                      if (formData.longitude && (parseFloat(formData.longitude) < -180 || parseFloat(formData.longitude) > 180)) errors.push('Invalid longitude');
                      
                      if (!formData.description) warnings.push('Description is recommended');
                      if (!formData.owner) warnings.push('Owner information is recommended');
                      if (!formData.commissioning_date) warnings.push('Commissioning date is recommended');
                      
                      return (
                        <Stack spacing={1}>
                          {errors.length === 0 && warnings.length === 0 && (
                            <Alert severity="success">All required fields are valid!</Alert>
                          )}
                          {errors.map((error, idx) => (
                            <Alert key={idx} severity="error">{error}</Alert>
                          ))}
                          {warnings.map((warning, idx) => (
                            <Alert key={idx} severity="warning">{warning}</Alert>
                          ))}
                        </Stack>
                      );
                    })()}
                  </CardContent>
                </Card>
              </Grid>

              {/* Performance Estimates */}
              {formData.capacity_mw && parseFloat(formData.capacity_mw) > 0 && (
                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="subtitle1" gutterBottom>
                        Performance Estimates
                      </Typography>
                      {(() => {
                        const capacity = parseFloat(formData.capacity_mw);
                        const capacityKw = capacity * 1000;
                        const capacityFactor = formData.type === 'solar' ? 0.20 : 0.35;
                        const annualGeneration = capacityKw * capacityFactor * 8760; // kWh
                        const monthlyGeneration = annualGeneration / 12;
                        // const dailyGeneration = annualGeneration / 365; // Reserved for future use
                        
                        // Financial estimates (if provided)
                        let annualRevenue = 0;
                        if (formData.energy_price) {
                          annualRevenue = annualGeneration * parseFloat(formData.energy_price) / 1000; // Convert kWh to MWh
                        } else if (formData.ppa_rate) {
                          annualRevenue = capacity * capacityFactor * 8760 * parseFloat(formData.ppa_rate) / 1000;
                        }
                        
                        return (
                          <Grid container spacing={2}>
                            <Grid item xs={12} sm={4}>
                              <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="h6" color="primary">
                                  {capacityFactor * 100}%
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                  Capacity Factor
                                </Typography>
                              </Paper>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                              <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="h6" color="primary">
                                  {Math.round(annualGeneration / 1000).toLocaleString()} MWh
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                  Annual Generation
                                </Typography>
                              </Paper>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                              <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="h6" color="primary">
                                  {Math.round(monthlyGeneration / 1000).toLocaleString()} MWh
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                  Monthly Average
                                </Typography>
                              </Paper>
                            </Grid>
                            {annualRevenue > 0 && (
                              <Grid item xs={12}>
                                <Paper sx={{ p: 2, bgcolor: 'success.light', color: 'success.contrastText' }}>
                                  <Typography variant="h6">
                                    Estimated Annual Revenue: {formData.currency} {annualRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </Typography>
                                </Paper>
                              </Grid>
                            )}
                          </Grid>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Site Summary */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Site Summary
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="textSecondary">Name</Typography>
                        <Typography variant="body1">{formData.name || 'Not set'}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="textSecondary">Type</Typography>
                        <Typography variant="body1">{formData.type.toUpperCase()}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="textSecondary">Capacity</Typography>
                        <Typography variant="body1">{formData.capacity_mw || 'Not set'} MW</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="textSecondary">Status</Typography>
                        <Chip label={formData.status} size="small" color={formData.status === 'operational' ? 'success' : 'default'} />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="textSecondary">Location</Typography>
                        <Typography variant="body1">
                          {formData.latitude && formData.longitude 
                            ? `${formData.latitude}, ${formData.longitude}`
                            : 'Not set'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="textSecondary">Timezone</Typography>
                        <Typography variant="body1">{formData.timezone}</Typography>
                      </Grid>
                      {formData.tags.length > 0 && (
                        <Grid item xs={12}>
                          <Typography variant="body2" color="textSecondary">Tags</Typography>
                          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                            {formData.tags.map((tag, idx) => (
                              <Chip key={idx} label={tag} size="small" />
                            ))}
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          {activeTab > 0 && (
            <Button onClick={() => setActiveTab(activeTab - 1)} disabled={loading}>
              Previous
            </Button>
          )}
          {activeTab < 6 && (
            <Button onClick={() => setActiveTab(activeTab + 1)} variant="outlined" disabled={loading}>
              Next
            </Button>
          )}
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

export default CreateSiteFormEnhanced;

