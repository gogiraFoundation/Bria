import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Error as CriticalIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as AcknowledgedIcon,
} from '@mui/icons-material';

interface Alert {
  id: string;
  name: string;
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  last_triggered?: string;
  last_triggered_relative?: string;
  active_event_count?: number;
}

interface AlertCardProps {
  alert: Alert;
  onAcknowledge?: (alertId: string) => void;
  acknowledged?: boolean;
}

const AlertCard: React.FC<AlertCardProps> = ({
  alert,
  onAcknowledge,
  acknowledged = false,
}) => {
  const getSeverityConfig = () => {
    switch (alert.severity) {
      case 'critical':
        return {
          color: 'error' as const,
          icon: <CriticalIcon />,
          bgColor: '#ffebee',
          borderColor: '#f44336',
        };
      case 'high':
      case 'medium':
        return {
          color: 'warning' as const,
          icon: <WarningIcon />,
          bgColor: '#fff3e0',
          borderColor: '#ff9800',
        };
      case 'low':
        return {
          color: 'info' as const,
          icon: <InfoIcon />,
          bgColor: '#e3f2fd',
          borderColor: '#2196f3',
        };
      default:
        return {
          color: 'default' as const,
          icon: <InfoIcon />,
          bgColor: '#f5f5f5',
          borderColor: '#9e9e9e',
        };
    }
  };

  const severityConfig = getSeverityConfig();

  return (
    <Card
      sx={{
        mb: 1,
        borderLeft: `4px solid ${severityConfig.borderColor}`,
        backgroundColor: severityConfig.bgColor,
        opacity: acknowledged ? 0.7 : 1,
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              {severityConfig.icon}
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                {alert.name}
              </Typography>
              <Chip
                label={alert.severity.toUpperCase()}
                color={severityConfig.color}
                size="small"
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
              {alert.active_event_count && alert.active_event_count > 1 && (
                <Chip
                  label={`${alert.active_event_count} events`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Box>
            {alert.description && (
              <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                {alert.description}
              </Typography>
            )}
            {alert.last_triggered_relative && (
              <Typography variant="caption" color="textSecondary">
                Triggered: {alert.last_triggered_relative}
              </Typography>
            )}
          </Box>
          {onAcknowledge && !acknowledged && (
            <Tooltip title="Acknowledge alert">
              <IconButton
                size="small"
                onClick={() => onAcknowledge(alert.id)}
                sx={{ ml: 1 }}
              >
                <AcknowledgedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {acknowledged && (
            <Chip
              icon={<AcknowledgedIcon />}
              label="Acknowledged"
              size="small"
              color="success"
              sx={{ ml: 1 }}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default AlertCard;

