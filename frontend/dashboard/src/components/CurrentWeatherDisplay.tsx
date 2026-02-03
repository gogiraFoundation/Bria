import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  WbSunny as SunIcon,
  Cloud as CloudIcon,
  WaterDrop as HumidityIcon,
  Air as WindIcon,
  Compress as PressureIcon,
  Visibility as VisibilityIcon,
  Opacity as PrecipitationIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface CurrentWeatherDisplayProps {
  siteId: string;
}

interface CurrentWeather {
  site_id: string;
  timestamp: string;
  temperature: number | null;
  feels_like: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  wind_gust: number | null;
  cloud_cover: number | null;
  precipitation: number | null;
  ghi_estimated: number | null;
  visibility: number | null;
  weather_main: string | null;
  weather_description: string | null;
  weather_icon: string | null;
  uv_index: number | null;
}

const CurrentWeatherDisplay: React.FC<CurrentWeatherDisplayProps> = ({ siteId }) => {
  const { data: weather, isLoading, error } = useQuery<CurrentWeather>({
    queryKey: ['current_weather', siteId],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/weather/current`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  const getWindDirection = (degrees: number | null): string => {
    if (degrees === null) return 'N/A';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
  };

  const getWeatherIcon = (icon: string | null): React.ReactElement => {
    if (!icon) return <SunIcon />;
    // OpenWeather icon codes: 01d, 02d, etc.
    if (icon.includes('01')) return <SunIcon />;
    if (icon.includes('02') || icon.includes('03')) return <CloudIcon />;
    return <CloudIcon />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 150 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">
            Error loading current weather: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!weather) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Current Weather
          </Typography>
          {weather.weather_main && (
            <Chip
              label={weather.weather_description || weather.weather_main}
              icon={getWeatherIcon(weather.weather_icon)}
              size="small"
            />
          )}
        </Box>

        <Grid container spacing={2}>
          {/* Temperature */}
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
              <SunIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4" color="primary.main">
                {weather.temperature !== null ? `${Math.round(weather.temperature)}°C` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Temperature
              </Typography>
              {weather.feels_like !== null && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5 }}>
                  Feels like {Math.round(weather.feels_like)}°C
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Humidity */}
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
              <HumidityIcon sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
              <Typography variant="h4" color="info.main">
                {weather.humidity !== null ? `${weather.humidity}%` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Humidity
              </Typography>
            </Box>
          </Grid>

          {/* Wind */}
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
              <WindIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
              <Typography variant="h4" color="success.main">
                {weather.wind_speed !== null ? `${weather.wind_speed.toFixed(1)} m/s` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Wind Speed
              </Typography>
              {weather.wind_direction !== null && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5 }}>
                  {getWindDirection(weather.wind_direction)} ({weather.wind_direction}°)
                </Typography>
              )}
              {weather.wind_gust !== null && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5 }}>
                  Gust: {weather.wind_gust.toFixed(1)} m/s
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Cloud Cover / GHI */}
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
              <CloudIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
              <Typography variant="h4" color="warning.main">
                {weather.cloud_cover !== null ? `${weather.cloud_cover}%` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Cloud Cover
              </Typography>
              {weather.ghi_estimated !== null && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5 }}>
                  GHI: {weather.ghi_estimated.toFixed(0)} W/m²
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Additional Details */}
          <Grid item xs={12}>
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Grid container spacing={2}>
                {weather.pressure !== null && (
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PressureIcon color="action" />
                      <Box>
                        <Typography variant="body2" color="textSecondary">Pressure</Typography>
                        <Typography variant="body1">{weather.pressure} hPa</Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}
                {weather.precipitation !== null && weather.precipitation > 0 && (
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PrecipitationIcon color="action" />
                      <Box>
                        <Typography variant="body2" color="textSecondary">Precipitation</Typography>
                        <Typography variant="body1">{weather.precipitation.toFixed(1)} mm</Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}
                {weather.visibility !== null && (
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <VisibilityIcon color="action" />
                      <Box>
                        <Typography variant="body2" color="textSecondary">Visibility</Typography>
                        <Typography variant="body1">{(weather.visibility / 1000).toFixed(1)} km</Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}
                {weather.uv_index !== null && (
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SunIcon color="action" />
                      <Box>
                        <Typography variant="body2" color="textSecondary">UV Index</Typography>
                        <Typography variant="body1">{weather.uv_index.toFixed(1)}</Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}
              </Grid>
            </Box>
          </Grid>
        </Grid>

        {weather.timestamp && (
          <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: 'block' }}>
            Last updated: {new Date(weather.timestamp).toLocaleString()}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default CurrentWeatherDisplay;

