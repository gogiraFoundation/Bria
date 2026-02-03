import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Tabs,
  Tab,
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
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
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
}

const InteractiveForecastAdjustments: React.FC<InteractiveForecastAdjustmentsProps> = ({
  siteId,
  horizon = 24,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [scenarioDialogOpen, setScenarioDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState('optimistic');
  const [adjustmentPercentage, setAdjustmentPercentage] = useState(10);
  const [scenarioNotes, setScenarioNotes] = useState('');
  const queryClient = useQueryClient();

  // Get base forecast (for future use)
  useQuery({
    queryKey: ['forecast', siteId, horizon],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast?horizon=${horizon}h`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
  });

  // Get saved scenarios
  const { data: savedScenarios } = useQuery({
    queryKey: ['forecast_scenarios', siteId],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.get(
        `${API_URL}/v1/sites/${siteId}/forecast/adjustments`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
  });

  // Create scenario mutation
  const createScenarioMutation = useMutation({
    mutationFn: async (scenario: any) => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      const response = await axios.post(
        `${API_URL}/v1/sites/${siteId}/forecast/scenarios`,
        scenario,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast_scenarios', siteId] });
      setScenarioDialogOpen(false);
    },
  });

  const handleCreateScenario = () => {
    createScenarioMutation.mutate({
      scenario_name: scenarioName,
      adjustment_percentage: adjustmentPercentage,
      notes: scenarioNotes,
    });
  };

  const scenarios = [
    { name: 'optimistic', label: 'Optimistic (+10%)', percentage: 10, color: 'success' },
    { name: 'pessimistic', label: 'Pessimistic (-10%)', percentage: -10, color: 'error' },
    { name: 'realistic', label: 'Realistic (0%)', percentage: 0, color: 'info' },
  ];

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Interactive Forecast Adjustments
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setScenarioDialogOpen(true)}
          >
            Create Scenario
          </Button>
        </Box>

        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
          <Tab label="Manual Adjustments" icon={<EditIcon />} iconPosition="start" />
          <Tab label="Scenarios" icon={<ChartIcon />} iconPosition="start" />
        </Tabs>

        {activeTab === 0 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              Manual forecast adjustments allow you to override specific forecast points.
              Drag points on the chart or use the adjustment controls below.
            </Alert>
            <ForecastChart siteId={siteId} horizon={horizon} showConfidence={true} />
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Adjustment Controls
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Adjustment Type</InputLabel>
                    <Select value="percentage" label="Adjustment Type">
                      <MenuItem value="percentage">Percentage</MenuItem>
                      <MenuItem value="override">Override</MenuItem>
                      <MenuItem value="offset">Offset</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Adjustment Value"
                    type="number"
                    defaultValue={0}
                    InputProps={{
                      endAdornment: <Typography variant="body2">%</Typography>,
                    }}
                  />
                </Grid>
              </Grid>
              <Button
                variant="outlined"
                startIcon={<SaveIcon />}
                sx={{ mt: 2 }}
                disabled
              >
                Save Adjustments (Coming Soon)
              </Button>
            </Box>
          </Box>
        )}

        {activeTab === 1 && (
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Predefined Scenarios
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {scenarios.map((scenario) => (
                <Grid item xs={12} sm={4} key={scenario.name}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        {scenario.percentage > 0 ? (
                          <TrendingUpIcon color={scenario.color as any} />
                        ) : scenario.percentage < 0 ? (
                          <TrendingDownIcon color={scenario.color as any} />
                        ) : (
                          <ChartIcon color={scenario.color as any} />
                        )}
                        <Typography variant="subtitle2">{scenario.label}</Typography>
                      </Box>
                      <Typography variant="body2" color="textSecondary">
                        Applies {scenario.percentage > 0 ? '+' : ''}{scenario.percentage}% adjustment to forecast
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        fullWidth
                        sx={{ mt: 1 }}
                        onClick={() => {
                          setScenarioName(scenario.name);
                          setAdjustmentPercentage(scenario.percentage);
                          setScenarioDialogOpen(true);
                        }}
                      >
                        Create Scenario
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {savedScenarios?.scenarios && savedScenarios.scenarios.length > 0 && (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Saved Scenarios
                </Typography>
                {savedScenarios.scenarios.map((scenario: any, index: number) => (
                  <Card key={index} variant="outlined" sx={{ mb: 2 }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="subtitle2">
                            {scenario.scenario_name}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            Created: {new Date(scenario.created_at).toLocaleString()}
                          </Typography>
                          {scenario.notes && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              {scenario.notes}
                            </Typography>
                          )}
                        </Box>
                        <Chip
                          label={`${scenario.adjustments_count || 0} adjustments`}
                          size="small"
                        />
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Scenario Creation Dialog */}
        <Dialog open={scenarioDialogOpen} onClose={() => setScenarioDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Create Forecast Scenario</DialogTitle>
          <DialogContent>
            <FormControl fullWidth sx={{ mb: 2, mt: 2 }}>
              <InputLabel>Scenario Type</InputLabel>
              <Select
                value={scenarioName}
                label="Scenario Type"
                onChange={(e) => setScenarioName(e.target.value)}
              >
                <MenuItem value="optimistic">Optimistic</MenuItem>
                <MenuItem value="pessimistic">Pessimistic</MenuItem>
                <MenuItem value="realistic">Realistic</MenuItem>
                <MenuItem value="custom">Custom</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ mb: 2 }}>
              <Typography gutterBottom>
                Adjustment Percentage: {adjustmentPercentage > 0 ? '+' : ''}{adjustmentPercentage}%
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
              />
            </Box>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Notes (Optional)"
              value={scenarioNotes}
              onChange={(e) => setScenarioNotes(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Alert severity="info">
              This will create a new forecast scenario with {adjustmentPercentage > 0 ? '+' : ''}{adjustmentPercentage}% adjustment applied to the base forecast.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setScenarioDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateScenario}
              variant="contained"
              disabled={createScenarioMutation.isPending}
            >
              {createScenarioMutation.isPending ? 'Creating...' : 'Create Scenario'}
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default InteractiveForecastAdjustments;

