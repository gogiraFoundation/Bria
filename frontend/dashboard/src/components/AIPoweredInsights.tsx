import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Stack,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Lightbulb as InsightIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { formatPlanningTime } from '../utils/formatPlanningTime';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface AIPoweredInsightsProps {
  siteId: string;
  horizon?: string;
  compact?: boolean;
}

interface Insight {
  type: string;
  severity: string;
  message: string;
  recommendation?: string;
  timestamp?: string;
}

interface Anomaly {
  type: string;
  severity: string;
  timestamp?: string;
  change_percentage?: number;
  previous_power_kw?: number;
  current_power_kw?: number;
  message: string;
}

interface Recommendation {
  type: string;
  priority: string;
  title: string;
  message: string;
  action: string;
}

interface InsightsData {
  site_id: string;
  horizon: string;
  insights: Insight[];
  anomalies: Anomaly[];
  recommendations: Recommendation[];
  summary: {
    total_insights: number;
    total_anomalies: number;
    total_recommendations: number;
    high_priority_count: number;
  };
}

const AIPoweredInsights: React.FC<AIPoweredInsightsProps> = ({
  siteId,
  horizon = '24h',
  compact = false,
}) => {
  const { data: insightsData, isLoading, error } = useQuery<InsightsData>({
    queryKey: ['forecast_insights', siteId, horizon],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast/insights?horizon=${horizon}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    },
    refetchInterval: 300000,
  });

  const severityColor = (severity: string) => {
    if (severity === 'high') return 'error';
    if (severity === 'medium') return 'warning';
    if (severity === 'low') return 'info';
    return 'default';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
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
            Could not load insights:{' '}
            {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!insightsData) return null;

  const { insights, anomalies, recommendations, summary } = insightsData;

  return (
    <Card>
      <CardContent sx={{ '&:last-child': { pb: compact ? 2 : 3 } }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          spacing={1}
          sx={{ mb: 1.5 }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Insights
          </Typography>
          <Stack direction="row" spacing={0.75}>
            <Chip label={`${summary.total_insights} notes`} size="small" variant="outlined" />
            <Chip
              label={`${summary.total_anomalies} steps`}
              size="small"
              color={summary.total_anomalies ? 'warning' : 'default'}
              variant="outlined"
            />
            <Chip
              label={`${summary.total_recommendations} actions`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Stack>
        </Stack>

        {insights.length > 0 && (
          <Stack divider={<Divider flexItem />} spacing={0} sx={{ mb: anomalies.length || recommendations.length ? 1.5 : 0 }}>
            {insights.map((insight, index) => (
              <Stack key={`insight-${index}`} direction="row" spacing={1.5} sx={{ py: 1.25 }} alignItems="flex-start">
                <InsightIcon fontSize="small" color="info" sx={{ mt: 0.25 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2">{insight.message}</Typography>
                  {insight.recommendation && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {insight.recommendation}
                    </Typography>
                  )}
                </Box>
                <Chip label={insight.severity} size="small" color={severityColor(insight.severity) as any} sx={{ height: 22 }} />
              </Stack>
            ))}
          </Stack>
        )}

        {recommendations.length > 0 && (
          <Stack spacing={1} sx={{ mb: anomalies.length ? 1.5 : 0 }}>
            {recommendations.map((rec, index) => (
              <Alert
                key={`rec-${index}`}
                severity={rec.priority === 'high' ? 'warning' : 'info'}
                icon={rec.priority === 'high' ? <ErrorIcon /> : <CheckCircleIcon />}
                sx={{ py: 0.5 }}
              >
                <Typography variant="body2" fontWeight={600}>
                  {rec.title}
                </Typography>
                <Typography variant="caption" display="block">
                  {rec.action}
                </Typography>
              </Alert>
            ))}
          </Stack>
        )}

        {anomalies.length > 0 && (
          <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} alignItems="center">
                <WarningIcon fontSize="small" color="warning" />
                <Typography variant="body2" fontWeight={600}>
                  Operating-hour step changes ({anomalies.length})
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Stack divider={<Divider flexItem />} spacing={0}>
                {anomalies.map((anomaly, index) => (
                  <Box key={`anom-${index}`} sx={{ py: 1 }}>
                    <Typography variant="body2">{anomaly.message}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatPlanningTime(anomaly.timestamp)}
                      {anomaly.change_percentage != null &&
                        ` · ${anomaly.change_percentage > 0 ? '+' : ''}${anomaly.change_percentage.toFixed(0)}%`}
                      {anomaly.previous_power_kw != null &&
                        anomaly.current_power_kw != null &&
                        ` · ${anomaly.previous_power_kw.toFixed(0)} → ${anomaly.current_power_kw.toFixed(0)} kW`}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        )}

        {insights.length === 0 && anomalies.length === 0 && recommendations.length === 0 && (
          <Alert severity="success">
            No unusual operating-hour steps. Diurnal solar behaviour is treated as normal.
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default AIPoweredInsights;
