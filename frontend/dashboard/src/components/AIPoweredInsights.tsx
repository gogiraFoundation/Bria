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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Lightbulb as InsightIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  TrendingDown as TrendingDownIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface AIPoweredInsightsProps {
  siteId: string;
  horizon?: string;
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
}) => {
  const { data: insightsData, isLoading, error } = useQuery<InsightsData>({
    queryKey: ['forecast_insights', siteId, horizon],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast/insights?horizon=${horizon}`,
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

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'default';
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'default';
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'high_variability':
        return <WarningIcon />;
      case 'extended_low_production':
        return <TrendingDownIcon />;
      default:
        return <InsightIcon />;
    }
  };

  const getAnomalyIcon = (type: string) => {
    switch (type) {
      case 'sudden_change':
        return <ErrorIcon />;
      default:
        return <WarningIcon />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
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
            Error loading AI insights: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!insightsData) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            AI-Powered Insights
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              label={`${insightsData.summary.total_insights} Insights`}
              size="small"
              color="info"
            />
            <Chip
              label={`${insightsData.summary.total_anomalies} Anomalies`}
              size="small"
              color="warning"
            />
            <Chip
              label={`${insightsData.summary.total_recommendations} Recommendations`}
              size="small"
              color="primary"
            />
          </Box>
        </Box>

        {/* Anomalies Section */}
        {insightsData.anomalies.length > 0 && (
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ErrorIcon color="error" />
                <Typography variant="subtitle1">
                  Detected Anomalies ({insightsData.anomalies.length})
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                {insightsData.anomalies.map((anomaly, index) => (
                  <React.Fragment key={index}>
                    <ListItem>
                      <ListItemIcon>
                        {getAnomalyIcon(anomaly.type)}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {anomaly.message}
                            <Chip
                              label={anomaly.severity}
                              size="small"
                              color={getSeverityColor(anomaly.severity) as any}
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            {anomaly.timestamp && (
                              <Typography variant="caption" color="textSecondary">
                                Time: {new Date(anomaly.timestamp).toLocaleString()}
                              </Typography>
                            )}
                            {anomaly.change_percentage !== undefined && (
                              <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                                Change: {anomaly.change_percentage > 0 ? '+' : ''}{anomaly.change_percentage.toFixed(1)}%
                              </Typography>
                            )}
                            {anomaly.previous_power_kw !== undefined && anomaly.current_power_kw !== undefined && (
                              <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                                {anomaly.previous_power_kw.toFixed(1)} kW → {anomaly.current_power_kw.toFixed(1)} kW
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < insightsData.anomalies.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Insights Section */}
        {insightsData.insights.length > 0 && (
          <Accordion defaultExpanded={insightsData.anomalies.length === 0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InsightIcon color="info" />
                <Typography variant="subtitle1">
                  Pattern Insights ({insightsData.insights.length})
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                {insightsData.insights.map((insight, index) => (
                  <React.Fragment key={index}>
                    <ListItem>
                      <ListItemIcon>
                        {getInsightIcon(insight.type)}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {insight.message}
                            <Chip
                              label={insight.severity}
                              size="small"
                              color={getSeverityColor(insight.severity) as any}
                            />
                          </Box>
                        }
                        secondary={
                          insight.recommendation && (
                            <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                              <strong>Recommendation:</strong> {insight.recommendation}
                            </Typography>
                          )
                        }
                      />
                    </ListItem>
                    {index < insightsData.insights.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Recommendations Section */}
        {insightsData.recommendations.length > 0 && (
          <Accordion defaultExpanded={insightsData.anomalies.length === 0 && insightsData.insights.length === 0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon color="success" />
                <Typography variant="subtitle1">
                  Recommendations ({insightsData.recommendations.length})
                </Typography>
                {insightsData.summary.high_priority_count > 0 && (
                  <Chip
                    label={`${insightsData.summary.high_priority_count} High Priority`}
                    size="small"
                    color="error"
                  />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {insightsData.recommendations.map((rec, index) => (
                  <Grid item xs={12} key={index}>
                    <Alert
                      severity={getPriorityColor(rec.priority) as any}
                      icon={rec.priority === 'high' ? <ErrorIcon /> : <CheckCircleIcon />}
                    >
                      <Typography variant="subtitle2" gutterBottom>
                        {rec.title}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        {rec.message}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        <strong>Action:</strong> {rec.action}
                      </Typography>
                    </Alert>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>
        )}

        {insightsData.anomalies.length === 0 &&
          insightsData.insights.length === 0 &&
          insightsData.recommendations.length === 0 && (
            <Alert severity="success">
              No issues detected. Forecast looks normal with no anomalies or significant patterns.
            </Alert>
          )}
      </CardContent>
    </Card>
  );
};

export default AIPoweredInsights;

