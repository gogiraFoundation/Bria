import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
  Alert,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import PageHeader from '../components/ui/PageHeader';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const TECH_CLASSES = [
  'pv_fixed',
  'pv_tracker',
  'pv_rooftop',
  'wind_onshore',
  'wind_small',
  'battery',
  'hybrid',
];

interface VendorRow {
  vendor_id: string;
  legal_name: string;
  website_url: string;
  contact_url?: string;
  countries: string[];
  last_verified_on: string;
  active: boolean;
  product_id?: string | null;
  technology_class?: string | null;
  min_capacity_mw?: number | null;
  max_capacity_mw?: number | null;
}

const SystemAdmin: React.FC = () => {
  const queryClient = useQueryClient();
  const [legalName, setLegalName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [contactUrl, setContactUrl] = useState('');
  const [countries, setCountries] = useState('GB');
  const [lastVerified, setLastVerified] = useState(new Date().toISOString().slice(0, 10));
  const [technologyClass, setTechnologyClass] = useState('pv_rooftop');
  const [minMw, setMinMw] = useState('0.01');
  const [maxMw, setMaxMw] = useState('5');
  const [notes, setNotes] = useState('');

  const authHeaders = () => {
    const token = localStorage.getItem('access_token');
    if (!token) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${token}` };
  };

  const vendorsQuery = useQuery<VendorRow[]>({
    queryKey: ['admin-vendors'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/v1/admin/vendors`, {
        headers: authHeaders(),
      });
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        legal_name: legalName,
        website_url: websiteUrl,
        contact_url: contactUrl || null,
        countries: countries.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
        last_verified_on: lastVerified,
        technology_class: technologyClass,
        min_capacity_mw: Number(minMw),
        max_capacity_mw: Number(maxMw),
        notes: notes || null,
      };
      const response = await axios.post(`${API_URL}/v1/admin/vendors`, payload, {
        headers: authHeaders(),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
      setLegalName('');
      setWebsiteUrl('');
      setContactUrl('');
      setNotes('');
    },
  });

  return (
    <Box>
      <PageHeader
        title="System administration"
        subtitle="Vendor catalogue (public websites only). Empty by default."
      />

      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Add vendor product
            </Typography>
            <Stack spacing={2} sx={{ maxWidth: 560 }}>
              <TextField
                label="Legal name"
                size="small"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                required
              />
              <TextField
                label="Website URL"
                size="small"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                required
              />
              <TextField
                label="Contact URL (public)"
                size="small"
                value={contactUrl}
                onChange={(e) => setContactUrl(e.target.value)}
              />
              <TextField
                label="Countries (comma-separated ISO2)"
                size="small"
                value={countries}
                onChange={(e) => setCountries(e.target.value)}
              />
              <TextField
                label="Last verified"
                type="date"
                size="small"
                value={lastVerified}
                onChange={(e) => setLastVerified(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                select
                label="Technology class"
                size="small"
                value={technologyClass}
                onChange={(e) => setTechnologyClass(e.target.value)}
              >
                {TECH_CLASSES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Min capacity (MW)"
                  size="small"
                  type="number"
                  value={minMw}
                  onChange={(e) => setMinMw(e.target.value)}
                />
                <TextField
                  label="Max capacity (MW)"
                  size="small"
                  type="number"
                  value={maxMw}
                  onChange={(e) => setMaxMw(e.target.value)}
                />
              </Stack>
              <TextField
                label="Notes"
                size="small"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <Button
                variant="contained"
                disabled={createMutation.isPending || !legalName || !websiteUrl}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Saving…' : 'Save vendor'}
              </Button>
              {createMutation.isError && (
                <Alert severity="error">
                  {(createMutation.error as any)?.response?.data?.detail ||
                    (createMutation.error as Error).message}
                </Alert>
              )}
              {createMutation.isSuccess && (
                <Alert severity="success">Vendor product created.</Alert>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Catalogue
            </Typography>
            {vendorsQuery.isLoading && <CircularProgress size={24} />}
            {vendorsQuery.isError && (
              <Alert severity="warning">
                Could not load vendors. Confirm migrations 005–006 are applied and you are an admin.
              </Alert>
            )}
            {vendorsQuery.data && vendorsQuery.data.length === 0 && (
              <Alert severity="info">No vendors listed yet.</Alert>
            )}
            {vendorsQuery.data && vendorsQuery.data.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Class</TableCell>
                    <TableCell>Countries</TableCell>
                    <TableCell>Capacity band (MW)</TableCell>
                    <TableCell>Verified</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vendorsQuery.data.map((row) => (
                    <TableRow key={`${row.vendor_id}-${row.product_id || 'none'}`}>
                      <TableCell>{row.legal_name}</TableCell>
                      <TableCell>{row.technology_class || '—'}</TableCell>
                      <TableCell>{(row.countries || []).join(', ')}</TableCell>
                      <TableCell>
                        {row.min_capacity_mw != null
                          ? `${row.min_capacity_mw}–${row.max_capacity_mw}`
                          : '—'}
                      </TableCell>
                      <TableCell>{row.last_verified_on}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default SystemAdmin;
