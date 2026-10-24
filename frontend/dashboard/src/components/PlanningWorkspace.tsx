import React, { useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import ProductionSchedulingPanel from './ProductionSchedulingPanel';
import AIPoweredInsights from './AIPoweredInsights';
import InteractiveForecastAdjustments from './InteractiveForecastAdjustments';
import ForecastComparisonPanel from './ForecastComparisonPanel';
import TechnologyRecommendation from './TechnologyRecommendation';

interface PlanningWorkspaceProps {
  siteId: string;
  forecastHorizon: string;
  horizonHours: number;
  energyPricePerMwh?: number;
  solarCapexPerMw?: number;
  windCapexPerMw?: number;
}

/**
 * Planning tab shell: Elastic/Calendly-inspired density on Bria ops-shell tokens.
 * One intro line, segmented primary tabs, single chart zone (scenarios XOR compare).
 */
const PlanningWorkspace: React.FC<PlanningWorkspaceProps> = ({
  siteId,
  forecastHorizon,
  horizonHours,
  energyPricePerMwh = 50,
  solarCapexPerMw = 1000000,
  windCapexPerMw = 1500000,
}) => {
  const [primaryTab, setPrimaryTab] = useState(0);
  const [toolsTab, setToolsTab] = useState(0);

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" component="h2">
          Planning
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Daytime dispatch, forecast scenarios, and technology screening.
        </Typography>
      </Box>

      <Tabs
        value={primaryTab}
        onChange={(_, v) => setPrimaryTab(v)}
        sx={{
          mb: 2,
          minHeight: 40,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 600 },
        }}
      >
        <Tab label="Dispatch" />
        <Tab label="Forecast tools" />
        <Tab label="Technology" />
      </Tabs>

      {primaryTab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ProductionSchedulingPanel siteId={siteId} horizon={forecastHorizon} compact />
          <AIPoweredInsights siteId={siteId} horizon={forecastHorizon} compact />
        </Box>
      )}

      {primaryTab === 1 && (
        <Box>
          <Tabs
            value={toolsTab}
            onChange={(_, v) => setToolsTab(v)}
            sx={{
              mb: 2,
              minHeight: 36,
              '& .MuiTab-root': { minHeight: 36, textTransform: 'none' },
            }}
          >
            <Tab label="Scenarios" />
            <Tab label="Compare" />
          </Tabs>
          {/* Mount one chart path only: avoids duplicate forecast fetches and CLS from stacked charts */}
          {toolsTab === 0 ? (
            <InteractiveForecastAdjustments siteId={siteId} horizon={horizonHours} compact />
          ) : (
            <ForecastComparisonPanel siteId={siteId} horizon={horizonHours} compact />
          )}
        </Box>
      )}

      {primaryTab === 2 && (
        <TechnologyRecommendation
          siteId={siteId}
          days={365}
          energyPricePerMwh={energyPricePerMwh}
          solarCapexPerMw={solarCapexPerMw}
          windCapexPerMw={windCapexPerMw}
          compact
        />
      )}
    </Box>
  );
};

export default PlanningWorkspace;
