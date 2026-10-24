import React from 'react';
import { Paper, Typography, Grid } from '@mui/material';

export interface KpiItem {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'renewable' | 'warning' | 'critical';
}

interface KpiStripProps {
  items: KpiItem[];
  /** Tighter vertical margin when nested inside a Planning card */
  dense?: boolean;
}

const toneColor = (tone: KpiItem['tone'] = 'default') => {
  switch (tone) {
    case 'renewable':
      return 'secondary.main';
    case 'warning':
      return 'warning.main';
    case 'critical':
      return 'error.main';
    default:
      return 'text.primary';
  }
};

const columnWidth = (count: number): 3 | 4 | 6 | 12 => {
  if (count <= 1) return 12;
  if (count === 2) return 6;
  if (count === 3) return 4;
  return 3;
};

const KpiStrip: React.FC<KpiStripProps> = ({ items, dense = false }) => {
  if (!items.length) return null;
  const md = columnWidth(items.length);

  return (
    <Grid container spacing={dense ? 1 : 2} sx={{ mb: dense ? 2 : 3 }}>
      {items.map((item) => (
        <Grid item xs={6} sm={6} md={md} key={item.label}>
          <Paper
            variant="outlined"
            sx={{
              p: dense ? 1.5 : 2,
              height: '100%',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="overline" color="text.secondary" display="block">
              {item.label}
            </Typography>
            <Typography
              variant="h4"
              sx={{
                mt: 0.5,
                color: toneColor(item.tone),
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
              }}
            >
              {item.value}
            </Typography>
            {item.hint && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {item.hint}
              </Typography>
            )}
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
};

export default KpiStrip;
