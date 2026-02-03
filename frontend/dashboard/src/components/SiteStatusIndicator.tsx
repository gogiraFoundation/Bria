import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Chip, Tooltip, Box, CircularProgress, Typography } from '@mui/material';
import { CheckCircle, Warning, Error as ErrorIcon } from '@mui/icons-material';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface SiteStatus {
  site_id: string;
  status: 'operational' | 'warning' | 'critical';
  last_data_update: string | null;
  last_data_update_relative: string | null;
  current_power_kw: number | null;
  forecast_power_kw: number | null;
  forecast_deviation_percent: number | null;
  communication_status: 'connected' | 'intermittent' | 'disconnected' | 'unknown';
  active_alerts_count: number;
  critical_alerts_count: number;
  warning_alerts_count: number;
  info_alerts_count: number;
  minutes_since_update: number | null;
}

interface SiteStatusIndicatorProps {
  siteId: string;
  size?: 'small' | 'medium';
  showDetails?: boolean;
}

const SiteStatusIndicator: React.FC<SiteStatusIndicatorProps> = ({
  siteId,
  size = 'medium',
  showDetails = true,
}) => {
  const { data: status, isLoading, error } = useQuery<SiteStatus>({
    queryKey: ['site-status', siteId],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        // Use a simple string error to avoid TypeScript conflicts
        const error = { message: 'Not authenticated' };
        throw error;
      }
      const response = await axios.get(`${API_URL}/v1/sites/${siteId}/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    },
    enabled: !!siteId,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  if (isLoading) {
    return (
      <Box display="flex" alignItems="center" gap={1}>
        <CircularProgress size={16} />
        <Typography variant="caption" color="textSecondary">
          Loading status...
        </Typography>
      </Box>
    );
  }

  if (error || !status) {
    return (
      <Chip
        label="Status Unknown"
        color="default"
        size={size}
        icon={<Warning />}
      />
    );
  }

  const getStatusConfig = () => {
    switch (status.status) {
      case 'operational':
        return {
          color: 'success' as const,
          icon: <CheckCircle />,
          label: 'Operational',
          bgColor: '#4caf50',
        };
      case 'warning':
        return {
          color: 'warning' as const,
          icon: <Warning />,
          label: 'Warning',
          bgColor: '#ff9800',
        };
      case 'critical':
        return {
          color: 'error' as const,
          icon: <ErrorIcon />,
          label: 'Critical',
          bgColor: '#f44336',
        };
      default:
        return {
          color: 'default' as const,
          icon: <Warning />,
          label: 'Unknown',
          bgColor: '#9e9e9e',
        };
    }
  };

  const statusConfig = getStatusConfig();

  const tooltipContent = (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
        Site Status: {statusConfig.label}
      </Typography>
      {status.last_data_update_relative && (
        <Typography variant="body2">
          Last Update: {status.last_data_update_relative}
        </Typography>
      )}
      {status.current_power_kw !== null && (
        <Typography variant="body2">
          Current Power: {status.current_power_kw.toLocaleString()} kW
        </Typography>
      )}
      {status.forecast_power_kw !== null && (
        <Typography variant="body2">
          Forecast: {status.forecast_power_kw.toLocaleString()} kW
        </Typography>
      )}
      {status.forecast_deviation_percent !== null && (
        <Typography variant="body2">
          Deviation: {status.forecast_deviation_percent > 0 ? '+' : ''}
          {status.forecast_deviation_percent.toFixed(1)}%
        </Typography>
      )}
      <Typography variant="body2" sx={{ mt: 1 }}>
        Communication: {status.communication_status}
      </Typography>
      {status.active_alerts_count > 0 && (
        <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold' }}>
          Active Alerts: {status.active_alerts_count}
          {status.critical_alerts_count > 0 && ` (${status.critical_alerts_count} critical)`}
        </Typography>
      )}
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          position: 'relative',
        }}
      >
        <Chip
          icon={statusConfig.icon}
          label={statusConfig.label}
          color={statusConfig.color}
          size={size}
          sx={{
            fontWeight: 'bold',
            animation: status.status === 'critical' ? 'pulse 2s infinite' : 'none',
            '@keyframes pulse': {
              '0%, 100%': {
                opacity: 1,
              },
              '50%': {
                opacity: 0.7,
              },
            },
          }}
        />
        {showDetails && status.last_data_update_relative && (
          <Typography variant="caption" color="textSecondary">
            Updated {status.last_data_update_relative}
          </Typography>
        )}
        {status.active_alerts_count > 0 && (
          <Chip
            label={status.active_alerts_count}
            size="small"
            color={status.critical_alerts_count > 0 ? 'error' : 'warning'}
            sx={{ ml: 0.5 }}
          />
        )}
      </Box>
    </Tooltip>
  );
};

export default SiteStatusIndicator;

