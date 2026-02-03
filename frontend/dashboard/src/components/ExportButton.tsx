import React, { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Description as CsvIcon,
  Code as JsonIcon,
} from '@mui/icons-material';
import { exportForecast, exportProduction } from '../utils/export';

export type ExportType = 'forecast' | 'production';

interface ExportButtonProps {
  siteId: string;
  exportType: ExportType;
  horizon?: string; // For forecast exports
  startDate?: Date; // For production exports
  endDate?: Date; // For production exports
  disabled?: boolean;
}

const ExportButton: React.FC<ExportButtonProps> = ({
  siteId,
  exportType,
  horizon = '24h',
  startDate,
  endDate,
  disabled = false,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleExport = async (format: 'csv' | 'json') => {
    setLoading(true);
    handleClose();

    try {
      if (exportType === 'forecast') {
        await exportForecast(siteId, format, horizon);
      } else {
        await exportProduction(siteId, format, startDate, endDate);
      }
    } catch (err: any) {
      console.error('Export error:', err);
      // Show error to user (could use a snackbar here)
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={loading ? <CircularProgress size={16} /> : <DownloadIcon />}
        onClick={handleClick}
        disabled={disabled || loading}
        size="small"
      >
        Export
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem onClick={() => handleExport('csv')}>
          <ListItemIcon>
            <CsvIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as CSV</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleExport('json')}>
          <ListItemIcon>
            <JsonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as JSON</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default ExportButton;

