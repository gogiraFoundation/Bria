import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  MenuItem,
  TextField,
  Typography,
  Alert,
  Chip,
  Stack,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import PageHeader from '../components/ui/PageHeader';
import type {
  RecommendationObjective,
  RecommendationRun,
  VendorMatch,
} from '../types/recommendation';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const PlanRecommendation: React.FC = () => {
  const [latitude, setLatitude] = useState('51.5');
  const [longitude, setLongitude] = useState('-0.12');
  const [countryCode, setCountryCode] = useState('GB');
  const [annualKwh, setAnnualKwh] = useState('80000');
  const [peakKw, setPeakKw] = useState('40');
  const [backupHours, setBackupHours] = useState('0');
  const [criticalFraction, setCriticalFraction] = useState('0');
  const [gridMode, setGridMode] = useState('firm_grid');
  const [objective, setObjective] = useState<RecommendationObjective>('min_cost_to_serve');
  const [roofOnly, setRoofOnly] = useState(false);
  const [energyPrice, setEnergyPrice] = useState('50');
  const [solarCapex, setSolarCapex] = useState('1000000');
  const [windCapex, setWindCapex] = useState('1500000');
  const [result, setResult] = useState<RecommendationRun | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string; contact_url: string } | null>(
    null
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Not authenticated');
      const payload = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        country_code: countryCode || null,
        annual_kwh: Number(annualKwh),
        peak_kw: Number(peakKw),
        backup_hours: Number(backupHours),
        critical_fraction: Number(criticalFraction),
        grid_mode: gridMode,
        objective,
        roof_only: roofOnly,
        energy_price_per_mwh: Number(energyPrice),
        solar_capex_per_mw: Number(solarCapex),
        wind_capex_per_mw: Number(windCapex),
      };
      const response = await axios.post(`${API_URL}/v1/recommendations`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data as RecommendationRun;
    },
    onSuccess: (data) => setResult(data),
  });

  const openDraft = async (vendor: VendorMatch, capacityMw?: number | null) => {
    const token = localStorage.getItem('access_token');
    if (!token || !result?.id) {
      setDraft({
        subject: `Enquiry: ${vendor.technology_class}`,
        body: `Hello ${vendor.legal_name},\n\nPlease share availability for ${vendor.technology_class}.\n`,
        contact_url: vendor.contact_url || vendor.website_url || '',
      });
      return;
    }
    const response = await axios.post(
      `${API_URL}/v1/recommendations/${result.id}/contact-draft`,
      {
        legal_name: vendor.legal_name,
        technology_class: vendor.technology_class,
        capacity_mw: capacityMw ?? null,
        contact_url: vendor.contact_url || vendor.website_url,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setDraft(response.data);
  };

  return (
    <Box>
      <PageHeader
        title="Plan technology"
        subtitle="Size renewable options from location, load, and constraints. Vendor catalogue starts empty."
      />

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent sx={{ '& .MuiTextField-root': { mb: 0 } }}>
              <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                Inputs
              </Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={6}>
                  <TextField
                    label="Latitude"
                    size="small"
                    fullWidth
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Longitude"
                    size="small"
                    fullWidth
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    label="Country"
                    size="small"
                    fullWidth
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                    inputProps={{ maxLength: 2 }}
                  />
                </Grid>
                <Grid item xs={8}>
                  <TextField
                    label="Annual energy (kWh)"
                    size="small"
                    fullWidth
                    type="number"
                    value={annualKwh}
                    onChange={(e) => setAnnualKwh(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Peak load (kW)"
                    size="small"
                    fullWidth
                    type="number"
                    value={peakKw}
                    onChange={(e) => setPeakKw(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Backup hours"
                    size="small"
                    fullWidth
                    type="number"
                    value={backupHours}
                    onChange={(e) => setBackupHours(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Critical fraction"
                    size="small"
                    fullWidth
                    type="number"
                    value={criticalFraction}
                    onChange={(e) => setCriticalFraction(e.target.value)}
                    helperText="0–1"
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={roofOnly}
                        onChange={(e) => setRoofOnly(e.target.checked)}
                        size="small"
                      />
                    }
                    label="Roof only"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    select
                    label="Grid mode"
                    size="small"
                    fullWidth
                    value={gridMode}
                    onChange={(e) => setGridMode(e.target.value)}
                  >
                    <MenuItem value="firm_grid">Firm grid</MenuItem>
                    <MenuItem value="weak_grid">Weak grid</MenuItem>
                    <MenuItem value="off_grid">Off grid</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    select
                    label="Objective"
                    size="small"
                    fullWidth
                    value={objective}
                    onChange={(e) => setObjective(e.target.value as RecommendationObjective)}
                  >
                    <MenuItem value="min_cost_to_serve">Lowest cost</MenuItem>
                    <MenuItem value="max_renewable_fraction">Max renewable %</MenuItem>
                    <MenuItem value="min_payback">Shortest payback</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Energy price ($/MWh)"
                    size="small"
                    fullWidth
                    type="number"
                    value={energyPrice}
                    onChange={(e) => setEnergyPrice(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Solar CAPEX ($/MW)"
                    size="small"
                    fullWidth
                    type="number"
                    value={solarCapex}
                    onChange={(e) => setSolarCapex(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Wind CAPEX ($/MW)"
                    size="small"
                    fullWidth
                    type="number"
                    value={windCapex}
                    onChange={(e) => setWindCapex(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? 'Running…' : 'Run recommendation'}
                  </Button>
                </Grid>
                {mutation.isError && (
                  <Grid item xs={12}>
                    <Alert severity="error">
                      {(mutation.error as any)?.response?.data?.detail ||
                        (mutation.error as Error).message}
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          {!result && (
            <Alert severity="info">
              Submit location and load to see a ranked technology shortlist and any matched vendors.
            </Alert>
          )}
          {result && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={`Quality: ${result.data_quality}`} size="small" />
                <Chip label={result.model_version} size="small" variant="outlined" />
                {result.id && <Chip label={`Run ${result.id.slice(0, 8)}…`} size="small" />}
              </Stack>
              {result.data_quality === 'low' && (
                <Alert severity="warning">
                  Weather sample is short or synthetic. Treat rankings as indicative.
                </Alert>
              )}
              {result.options.map((opt) => (
                <Card key={opt.technology_class} variant="outlined">
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="h6">
                        #{opt.rank} {opt.technology_class}
                      </Typography>
                      <Chip
                        size="small"
                        color={opt.eligible ? 'success' : 'default'}
                        label={opt.eligible ? 'Eligible' : 'Excluded'}
                      />
                    </Stack>
                    {!opt.eligible && opt.exclusion_reason && (
                      <Typography variant="body2" color="text.secondary">
                        {opt.exclusion_reason}
                      </Typography>
                    )}
                    {opt.eligible && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        Capacity: {opt.capacity_mw ?? '—'} MW
                        {opt.storage_kwh != null ? ` • Storage: ${opt.storage_kwh} kWh` : ''}
                        {opt.solar_fraction != null
                          ? ` • Solar fraction: ${opt.solar_fraction}`
                          : ''}
                        {opt.annual_mwh != null
                          ? ` • Annual: ${opt.annual_mwh.toFixed(1)} MWh`
                          : ''}
                        {opt.lcoe_usd_per_mwh != null
                          ? ` • LCOE: $${opt.lcoe_usd_per_mwh.toFixed(2)}/MWh`
                          : ' • LCOE: not priced'}
                      </Typography>
                    )}
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Vendors
                    </Typography>
                    {result.vendors.filter((v) => v.technology_class === opt.technology_class)
                      .length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        {result.vendor_message ||
                          'No listed vendor covers this class in this country.'}
                      </Typography>
                    ) : (
                      result.vendors
                        .filter((v) => v.technology_class === opt.technology_class)
                        .map((v) => (
                          <Stack
                            key={v.vendor_product_id}
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            sx={{ mb: 1 }}
                          >
                            <Box>
                              <Typography variant="body2">{v.legal_name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {v.fit_notes} • Verified {v.last_verified_on}
                              </Typography>
                            </Box>
                            <Button size="small" onClick={() => openDraft(v, opt.capacity_mw)}>
                              Contact draft
                            </Button>
                          </Stack>
                        ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Grid>
      </Grid>

      <Dialog open={!!draft} onClose={() => setDraft(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Contact draft</DialogTitle>
        <DialogContent>
          {draft && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Subject" value={draft.subject} fullWidth InputProps={{ readOnly: true }} />
              <TextField
                label="Body"
                value={draft.body}
                fullWidth
                multiline
                minRows={6}
                InputProps={{ readOnly: true }}
              />
              {draft.contact_url && (
                <Typography variant="body2">
                  Public contact: <a href={draft.contact_url}>{draft.contact_url}</a>
                </Typography>
              )}
              <Alert severity="info">Copy this draft and send it yourself. Bria does not email vendors.</Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PlanRecommendation;
