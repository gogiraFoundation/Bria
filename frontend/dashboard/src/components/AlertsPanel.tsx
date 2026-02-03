import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Chip,
} from '@mui/material';
import { Link } from 'react-router-dom';
import AlertCard from './AlertCard';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface AlertData {
  id: string;
  name: string;
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  last_triggered?: string;
  last_triggered_relative?: string;
  active_event_count?: number;
}

interface AlertsResponse {
  site_id: string;
  alerts: AlertData[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
}

interface AlertsPanelProps {
  siteId: string;
  maxAlerts?: number;
  showAcknowledge?: boolean;
}

const AlertsPanel: React.FC<AlertsPanelProps> = ({
  siteId,
  maxAlerts = 5,
  showAcknowledge = true,
}) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<AlertsResponse>({
    queryKey: ['site-alerts', siteId],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(`${API_URL}/v1/sites/${siteId}/alerts`, {
        params: { status: 'active' },
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

  const handleAcknowledge = async (alertId: string) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      await axios.post(
        `${API_URL}/v1/alerts/${alertId}/acknowledge`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      // Refresh alerts
      queryClient.invalidateQueries({ queryKey: ['site-alerts', siteId] });
    } catch (err: any) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        Failed to load alerts: {error instanceof Error ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  if (!data || !data.alerts || data.alerts.length === 0) {
    return (
      <Box>
        <Alert severity="success" sx={{ mb: 2 }}>
          No active alerts
        </Alert>
      </Box>
    );
  }

  const alertsToShow = data.alerts.slice(0, maxAlerts);
  const hasMore = data.alerts.length > maxAlerts;

  return (
    <Box>
      {/* Summary */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" color="textSecondary">
          {data.summary.total} active alert{data.summary.total !== 1 ? 's' : ''}
          {data.summary.critical > 0 && (
            <Chip
              label={`${data.summary.critical} critical`}
              color="error"
              size="small"
              sx={{ ml: 1 }}
            />
          )}
          {data.summary.warning > 0 && (
            <Chip
              label={`${data.summary.warning} warning`}
              color="warning"
              size="small"
              sx={{ ml: 1 }}
            />
          )}
        </Typography>
      </Box>

      {/* Alert List */}
      <Box>
        {alertsToShow.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onAcknowledge={showAcknowledge ? handleAcknowledge : undefined}
          />
        ))}
      </Box>

      {/* View All Link */}
      {hasMore && (
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Button
            component={Link}
            to={`/alerts?site=${siteId}`}
            variant="outlined"
            size="small"
          >
            View All Alerts ({data.alerts.length})
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default AlertsPanel;

