import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Alert,
  FormControlLabel,
  Switch,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { notificationService } from '../../services/notificationService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface CreateAlertFormProps {
  open: boolean;
  siteId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

interface AlertFormData {
  name: string;
  description: string;
  condition_type: 'threshold' | 'anomaly' | 'forecast_error' | 'data_gap';
  operator: 'greater_than' | 'less_than' | 'equals' | 'not_equals';
  threshold: string;
  metric: string;
  window_minutes: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

const CreateAlertForm: React.FC<CreateAlertFormProps> = ({
  open,
  siteId,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<AlertFormData>({
    name: '',
    description: '',
    condition_type: 'threshold',
    operator: 'greater_than',
    threshold: '',
    metric: 'power_kw',
    window_minutes: '60',
    severity: 'medium',
    enabled: true,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (field: keyof AlertFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: any } }
  ) => {
    const value = e.target.value;
    if (field === 'enabled') {
      setFormData({ ...formData, [field]: value as boolean });
    } else {
      setFormData({ ...formData, [field]: value });
    }
    setError('');
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('Alert name is required');
      return false;
    }
    if (formData.condition_type === 'threshold' && !formData.threshold) {
      setError('Threshold is required for threshold alerts');
      return false;
    }
    if (formData.condition_type === 'threshold') {
      const threshold = parseFloat(formData.threshold);
      if (isNaN(threshold)) {
        setError('Threshold must be a valid number');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const condition: any = {
        type: formData.condition_type,
      };

      if (formData.condition_type === 'threshold') {
        condition.operator = formData.operator;
        condition.threshold = parseFloat(formData.threshold);
        condition.metric = formData.metric;
        condition.window_minutes = parseInt(formData.window_minutes) || 60;
      } else if (formData.condition_type === 'anomaly') {
        condition.window_minutes = parseInt(formData.window_minutes) || 60;
      } else if (formData.condition_type === 'forecast_error') {
        condition.threshold = parseFloat(formData.threshold) || 20.0; // Default 20% error
        condition.window_minutes = parseInt(formData.window_minutes) || 60;
      } else if (formData.condition_type === 'data_gap') {
        condition.window_minutes = parseInt(formData.window_minutes) || 60;
      }

      const alertData = {
        site_id: siteId,
        name: formData.name,
        description: formData.description || undefined,
        condition,
        severity: formData.severity,
        enabled: formData.enabled,
      };

      await axios.post(
        `${API_URL}/v1/sites/${siteId}/alerts`,
        alertData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['site-alerts', siteId] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });

      notificationService.success('Alert created successfully');
      
      if (onSuccess) {
        onSuccess();
      }
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        condition_type: 'threshold',
        operator: 'greater_than',
        threshold: '',
        metric: 'power_kw',
        window_minutes: '60',
        severity: 'medium',
        enabled: true,
      });
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to create alert';
      setError(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
      notificationService.error('Failed to create alert');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Create New Alert</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Alert Name"
              value={formData.name}
              onChange={handleChange('name')}
              required
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={handleChange('description')}
              multiline
              rows={3}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Condition Type</InputLabel>
              <Select
                value={formData.condition_type}
                label="Condition Type"
                onChange={(e) => handleChange('condition_type')({ target: { value: e.target.value } })}
              >
                <MenuItem value="threshold">Threshold</MenuItem>
                <MenuItem value="anomaly">Anomaly</MenuItem>
                <MenuItem value="forecast_error">Forecast Error</MenuItem>
                <MenuItem value="data_gap">Data Gap</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Severity</InputLabel>
              <Select
                value={formData.severity}
                label="Severity"
                onChange={(e) => handleChange('severity')({ target: { value: e.target.value } })}
              >
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {formData.condition_type === 'threshold' && (
            <>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Metric</InputLabel>
                  <Select
                    value={formData.metric}
                    label="Metric"
                    onChange={(e) => handleChange('metric')({ target: { value: e.target.value } })}
                  >
                    <MenuItem value="power_kw">Power (kW)</MenuItem>
                    <MenuItem value="energy_kwh">Energy (kWh)</MenuItem>
                    <MenuItem value="availability">Availability (%)</MenuItem>
                    <MenuItem value="efficiency">Efficiency (%)</MenuItem>
                    <MenuItem value="forecast_deviation">Forecast Deviation (%)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Operator</InputLabel>
                  <Select
                    value={formData.operator}
                    label="Operator"
                    onChange={(e) => handleChange('operator')({ target: { value: e.target.value } })}
                  >
                    <MenuItem value="greater_than">Greater Than</MenuItem>
                    <MenuItem value="less_than">Less Than</MenuItem>
                    <MenuItem value="equals">Equals</MenuItem>
                    <MenuItem value="not_equals">Not Equals</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Threshold"
                  type="number"
                  value={formData.threshold}
                  onChange={handleChange('threshold')}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Time Window (minutes)"
                  type="number"
                  value={formData.window_minutes}
                  onChange={handleChange('window_minutes')}
                  inputProps={{ min: 1 }}
                />
              </Grid>
            </>
          )}

          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => handleChange('enabled')({ target: { value: e.target.checked } })}
                />
              }
              label="Enable Alert"
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : 'Create Alert'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateAlertForm;

