import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  Grid,
  Slider,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShowChart as ChartIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import ForecastChart from './charts/ForecastChartSimple';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface InteractiveForecastAdjustmentsProps {
  siteId: string;
  horizon?: number;
  compact?: boolean;
}

const InteractiveForecastAdjustments: React.FC<InteractiveForecastAdjustmentsProps> = ({
  siteId,
  horizon = 24,
  compact = false,
}) => {
  const [scenarioDialogOpen, setScenarioDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState('optimistic');
  const [adjustmentPercentage, setAdjustmentPercentage] = useState(10);
  const [scenarioNotes, setScenarioNotes] = useState('');
  const [lastCreatedName, setLastCreatedName] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: savedScenarios } = useQuery({
    queryKey: ['forecast_scenarios', siteId],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const response = await axios.get(`${API_URL}/v1/sites/${siteId}/forecast/adjustments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
  });

  const createScenarioMutation = useMutation({
    mutationFn: async (scenario: Record<string, unknown>) => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const response = await axios.post(
        `${API_URL}/v1/sites/${siteId}/forecast/scenarios`,
        { ...scenario, horizon_hours: horizon },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['forecast_scenarios', siteId] });
      setScenarioDialogOpen(false);
      setScenarioNotes('');
      setLastCreatedName(data?.scenario_name || scenarioName);
    },
  });

  const handleCreateScenario = () => {
    setLastCreatedName(null);
    createScenarioMutation.mutate({
      scenario_name: scenarioName,
      adjustment_percentage: adjustmentPercentage,
      notes: scenarioNotes,
    });
  };

  const scenarioError = createScenarioMutation.isError
    ? (createScenarioMutation.error as any)?.response?.data?.detail ||
      (createScenarioMutation.error as Error).message
    : null;

  const presets = [
    { name: 'optimistic', label: 'Optimistic', percentage: 10 },
    { name: 'pessimistic', label: 'Pessimistic', percentage: -10 },
    { name: 'realistic', label: 'Baseline', percentage: 0 },
  ];

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
            Scenarios
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setScenarioDialogOpen(true)}
          >
            Create
          </Button>
        </Stack>

        {lastCreatedName && (
          <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setLastCreatedName(null)}>
            Scenario '{lastCreatedName}' saved.
          </Alert>
        )}

        <Grid container spacing={1} sx={{ mb: 2 }}>
          {presets.map((preset) => (
            <Grid item xs={12} sm={4} key={preset.name}>
              <Button
                fullWidth
                variant="outlined"
                size="small"
                startIcon={
                  preset.percentage > 0 ? (
                    <TrendingUpIcon fontSize="small" />
                  ) : preset.percentage < 0 ? (
                    <TrendingDownIcon fontSize="small" />
                  ) : (
                    <ChartIcon fontSize="small" />
                  )
                }
                onClick={() => {
                  setScenarioName(preset.name);
                  setAdjustmentPercentage(preset.percentage);
                  setScenarioDialogOpen(true);
                }}
                sx={{ justifyContent: 'flex-start', py: 1 }}
              >
                {preset.label} ({preset.percentage > 0 ? '+' : ''}
                {preset.percentage}%)
              </Button>
            </Grid>
          ))}
        </Grid>

        <ForecastChart siteId={siteId} horizon={horizon} showConfidence={true} />

        <Box sx={{ mt: 2 }}>
          <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Saved
          </Typography>
          {savedScenarios?.scenarios?.length > 0 ? (
            <Stack spacing={1}>
              {savedScenarios.scenarios.map((scenario: any, index: number) => (
                <Stack
                  key={`${scenario.scenario_name}-${index}`}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    px: 1.5,
                    py: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {scenario.scenario_name}
                      {scenario.adjustment_percentage != null && (
                        <Typography component="span" variant="body2" color="text.secondary">
                          {' '}
                          ({scenario.adjustment_percentage > 0 ? '+' : ''}
                          {scenario.adjustment_percentage}%)
                        </Typography>
                      )}
                    </Typography>
                    {scenario.notes && (
                      <Typography variant="caption" color="text.secondary">
                        {scenario.notes}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    label={`${scenario.adjustments_count || scenario.values?.length || 0} pts`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No saved scenarios. Create one to apply a percentage shift to the {horizon}h forecast.
            </Typography>
          )}
        </Box>

        <Dialog open={scenarioDialogOpen} onClose={() => setScenarioDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Create forecast scenario</DialogTitle>
          <DialogContent>
            <FormControl fullWidth sx={{ mb: 2, mt: 1 }}>
              <InputLabel>Scenario type</InputLabel>
              <Select
                value={scenarioName}
                label="Scenario type"
                onChange={(e) => {
                  const name = e.target.value;
                  setScenarioName(name);
                  if (name === 'optimistic') setAdjustmentPercentage(10);
                  if (name === 'pessimistic') setAdjustmentPercentage(-10);
                  if (name === 'realistic') setAdjustmentPercentage(0);
                }}
              >
                <MenuItem value="optimistic">Optimistic</MenuItem>
                <MenuItem value="pessimistic">Pessimistic</MenuItem>
                <MenuItem value="realistic">Baseline</MenuItem>
                <MenuItem value="custom">Custom</MenuItem>
              </Select>
            </FormControl>
            <Typography gutterBottom variant="body2">
              Adjustment: {adjustmentPercentage > 0 ? '+' : ''}
              {adjustmentPercentage}%
            </Typography>
            <Slider
              value={adjustmentPercentage}
              onChange={(_, value) => setAdjustmentPercentage(value as number)}
              min={-50}
              max={50}
              step={1}
              marks={[
                { value: -50, label: '-50%' },
                { value: 0, label: '0%' },
                { value: 50, label: '+50%' },
              ]}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Notes (optional)"
              value={scenarioNotes}
              onChange={(e) => setScenarioNotes(e.target.value)}
              sx={{ mb: 1 }}
            />
            {scenarioError && <Alert severity="error">{String(scenarioError)}</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setScenarioDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateScenario}
              variant="contained"
              disabled={createScenarioMutation.isPending}
            >
              {createScenarioMutation.isPending ? 'Creating…' : 'Create scenario'}
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default InteractiveForecastAdjustments;
