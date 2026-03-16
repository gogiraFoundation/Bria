import React, { useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Alert,
  AlertTitle,
  List,
  ListItem,
  Divider,
} from '@mui/material';
import {
  Lightbulb as LightbulbIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useForecastData } from '../hooks/useForecastData';

interface ForecastSuggestionsProps {
  siteId: string;
  horizon: number;
  siteType?: string;
  capacityMw?: number;
}

interface Suggestion {
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  icon: React.ReactNode;
  priority: number;
}

const ForecastSuggestions: React.FC<ForecastSuggestionsProps> = ({
  siteId,
  horizon,
  siteType,
  capacityMw,
}) => {
  const { data: forecast, isLoading, error } = useForecastData(siteId, horizon);

  const suggestions = useMemo(() => {
    if (!forecast || !forecast.timestamps || forecast.timestamps.length === 0) {
      return [];
    }

    const suggestionsList: Suggestion[] = [];
    const timestamps = forecast.timestamps.map((ts) => new Date(ts));
    const now = new Date();
    const futureIndices = timestamps
      .map((ts, idx) => ({ ts, idx }))
      .filter(({ ts }) => ts > now)
      .map(({ idx }) => idx);
    
    if (futureIndices.length === 0) {
      return [];
    }

    // Get forecast values
    const values = forecast.values as number[];
    const p50Values = forecast.confidenceIntervals?.p50 || values;
    const p10Values = forecast.confidenceIntervals?.p10 || [];
    const p90Values = forecast.confidenceIntervals?.p90 || [];

    // Calculate statistics for future data
    const futurePowers = futureIndices.map((idx) => p50Values[idx] || 0);
    const maxPower = Math.max(...futurePowers);
    const minPower = Math.min(...futurePowers);
    const avgPower = futurePowers.reduce((a, b) => a + b, 0) / futurePowers.length;
    const capacityKw = (capacityMw || 0) * 1000;
    const capacityFactor = capacityKw > 0 ? (avgPower / capacityKw) * 100 : 0;

    // Calculate confidence spread
    const confidences = futureIndices.map((idx) => {
      const p10 = p10Values[idx] || 0;
      const p90 = p90Values[idx] || 0;
      const p50 = p50Values[idx] || 0;
      return p50 > 0 ? ((p90 - p10) / p50) * 100 : 0;
    });
    const avgConfidenceSpread = confidences.length > 0 
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
      : 0;

    // Check for peak production periods
    const peakHours = futureIndices.filter((idx) => {
      const power = p50Values[idx] || 0;
      return power > capacityKw * 0.8;
    }).length;

    // Check for low production periods
    const lowHours = futureIndices.filter((idx) => {
      const power = p50Values[idx] || 0;
      return power < capacityKw * 0.2;
    }).length;

    // Check for variability
    const variability = maxPower - minPower;
    const variabilityPercent = capacityKw > 0 ? (variability / capacityKw) * 100 : 0;

    // 1. High production forecast
    if (capacityFactor > 60) {
      suggestionsList.push({
        type: 'success',
        title: 'Excellent Production Forecast',
        message: `Expected average capacity factor of ${capacityFactor.toFixed(1)}% over the next ${horizon}h. This is above average for ${siteType || 'this site'}. Consider optimizing grid dispatch during peak hours.`,
        icon: <TrendingUpIcon />,
        priority: 1,
      });
    }

    // 2. Low production forecast
    if (capacityFactor < 20 && capacityKw > 0) {
      suggestionsList.push({
        type: 'warning',
        title: 'Low Production Expected',
        message: `Forecast shows low production (${capacityFactor.toFixed(1)}% capacity factor). ${lowHours > 0 ? `${lowHours} hours of very low production expected. ` : ''}Consider maintenance scheduling or grid backup planning.`,
        icon: <TrendingDownIcon />,
        priority: 2,
      });
    }

    // 3. High variability
    if (variabilityPercent > 50 && capacityKw > 0) {
      suggestionsList.push({
        type: 'warning',
        title: 'High Forecast Variability',
        message: `Significant power output variations expected (${variabilityPercent.toFixed(0)}% of capacity). This may indicate changing weather conditions. Monitor closely and prepare for rapid adjustments.`,
        icon: <WarningIcon />,
        priority: 3,
      });
    }

    // 4. Peak production opportunities
    if (peakHours > 0) {
      suggestionsList.push({
        type: 'info',
        title: 'Peak Production Periods',
        message: `${peakHours} hour${peakHours !== 1 ? 's' : ''} of high production (>80% capacity) forecasted. Consider maximizing grid export or energy storage during these periods.`,
        icon: <LightbulbIcon />,
        priority: 4,
      });
    }

    // 5. Low confidence (high spread)
    if (avgConfidenceSpread > 40) {
      suggestionsList.push({
        type: 'warning',
        title: 'High Forecast Uncertainty',
        message: `Forecast confidence spread is ${avgConfidenceSpread.toFixed(0)}%, indicating higher uncertainty. Consider conservative planning and have backup resources ready.`,
        icon: <WarningIcon />,
        priority: 5,
      });
    } else if (avgConfidenceSpread < 15) {
      suggestionsList.push({
        type: 'success',
        title: 'High Forecast Confidence',
        message: `Forecast shows low uncertainty (${avgConfidenceSpread.toFixed(0)}% spread), indicating reliable predictions. You can plan with confidence.`,
        icon: <CheckCircleIcon />,
        priority: 6,
      });
    }

    // 6. Solar-specific suggestions
    if (siteType === 'solar') {
      // Check for night periods
      const nightHours = futureIndices.filter((idx) => {
        const hour = timestamps[idx].getHours();
        return hour < 6 || hour > 20;
      }).length;

      if (nightHours > horizon * 0.3) {
        suggestionsList.push({
          type: 'info',
          title: 'Night Period Planning',
          message: `${nightHours} hours of night time in forecast. Ensure energy storage or backup systems are ready for zero production periods.`,
          icon: <InfoIcon />,
          priority: 7,
        });
      }
    }

    // 7. Wind-specific suggestions
    if (siteType === 'wind') {
      if (variabilityPercent > 30) {
        suggestionsList.push({
          type: 'info',
          title: 'Wind Variability',
          message: `Wind conditions show ${variabilityPercent.toFixed(0)}% variability. This is normal for wind farms. Consider smoothing strategies or energy storage.`,
          icon: <InfoIcon />,
          priority: 8,
        });
      }
    }

    // 8. General optimization
    if (capacityFactor > 40 && capacityFactor < 60) {
      suggestionsList.push({
        type: 'info',
        title: 'Good Production Window',
        message: `Steady production forecast (${capacityFactor.toFixed(1)}% capacity factor). Good time for routine operations and maintenance planning.`,
        icon: <InfoIcon />,
        priority: 9,
      });
    }

    // Sort by priority
    return suggestionsList.sort((a, b) => a.priority - b.priority).slice(0, 5); // Show top 5
  }, [forecast, horizon, siteType, capacityMw]);

  if (isLoading) {
    return (
      <Card
        elevation={2}
        sx={{
          borderRadius: 2,
          height: '100%',
        }}
      >
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Forecast Insights & Recommendations
          </Typography>
          <Typography color="textSecondary">Analyzing forecast data...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return null; // Don't show suggestions if forecast failed
  }

  if (suggestions.length === 0) {
    return (
      <Card
        elevation={2}
        sx={{
          borderRadius: 2,
          height: '100%',
          transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: 4,
          },
        }}
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <LightbulbIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Forecast Insights & Recommendations
            </Typography>
          </Box>
          <Alert 
            severity="info"
            sx={{
              borderRadius: 2,
            }}
          >
            Insufficient forecast data for analysis. Check back once more data is available.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const getSeverity = (type: string): 'success' | 'info' | 'warning' | 'error' => {
    return type as 'success' | 'info' | 'warning' | 'error';
  };

  return (
    <Card
      elevation={2}
      sx={{
        borderRadius: 2,
        height: '100%',
        transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <LightbulbIcon 
            color="primary" 
            sx={{
              animation: 'glow 2s ease-in-out infinite',
              '@keyframes glow': {
                '0%, 100%': { opacity: 1, filter: 'drop-shadow(0 0 5px rgba(25, 118, 210, 0.5))' },
                '50%': { opacity: 0.8, filter: 'drop-shadow(0 0 10px rgba(25, 118, 210, 0.8))' },
              },
            }}
          />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Forecast Insights & Recommendations
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <List sx={{ p: 0 }}>
          {suggestions.map((suggestion, index) => (
            <ListItem 
              key={index} 
              sx={{ 
                px: 0, 
                py: 1.5,
                animation: `slideIn 0.5s ease-out ${index * 0.1}s both`,
                '@keyframes slideIn': {
                  from: {
                    opacity: 0,
                    transform: 'translateX(-10px)',
                  },
                  to: {
                    opacity: 1,
                    transform: 'translateX(0)',
                  },
                },
              }}
            >
              <Alert
                severity={getSeverity(suggestion.type)}
                icon={suggestion.icon}
                sx={{ 
                  width: '100%',
                  borderRadius: 2,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateX(5px)',
                    boxShadow: 2,
                  },
                }}
              >
                <AlertTitle sx={{ fontWeight: 600 }}>{suggestion.title}</AlertTitle>
                {suggestion.message}
              </Alert>
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
};

export default ForecastSuggestions;

