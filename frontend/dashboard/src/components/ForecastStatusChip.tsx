import React from 'react';
import { Chip, CircularProgress } from '@mui/material';
import { useForecastData } from '../hooks/useForecastData';

interface ForecastStatusChipProps {
  siteId: string;
  horizon?: number;
}

/**
 * Compact status from the forecast hook for overview cards.
 */
const ForecastStatusChip: React.FC<ForecastStatusChipProps> = ({ siteId, horizon = 24 }) => {
  const { data, isLoading, isError } = useForecastData(siteId, horizon, true);

  if (isLoading) {
    return <CircularProgress size={16} sx={{ ml: 0.5 }} aria-label="Loading forecast status" />;
  }

  if (isError) {
    return <Chip label="Error" size="small" color="error" variant="outlined" />;
  }

  if (!data || data.status === 'unavailable' || !data.values?.length) {
    return (
      <Chip
        label="Unavailable"
        size="small"
        color="warning"
        variant="outlined"
        aria-label="Forecast unavailable"
      />
    );
  }

  return (
    <Chip
      label="Available"
      size="small"
      color="success"
      variant="outlined"
      aria-label="Forecast available"
    />
  );
};

export default ForecastStatusChip;
