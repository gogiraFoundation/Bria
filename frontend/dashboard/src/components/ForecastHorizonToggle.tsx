import React from 'react';
import { ToggleButton, ToggleButtonGroup, Box, Tooltip } from '@mui/material';
import { AccessTime, CalendarToday, DateRange, Today } from '@mui/icons-material';

export type ForecastHorizon = '24h' | '48h' | '7d' | '30d';

interface ForecastHorizonToggleProps {
  value: ForecastHorizon;
  onChange: (horizon: ForecastHorizon) => void;
  disabled?: boolean;
}

const ForecastHorizonToggle: React.FC<ForecastHorizonToggleProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const handleChange = (
    event: React.MouseEvent<HTMLElement>,
    newValue: ForecastHorizon | null,
  ) => {
    if (newValue !== null) {
      onChange(newValue);
    }
  };

  const horizonOptions: Array<{
    value: ForecastHorizon;
    label: string;
    tooltip: string;
    icon: React.ReactNode;
  }> = [
    {
      value: '24h',
      label: '24h',
      tooltip: '24-hour forecast',
      icon: <AccessTime fontSize="small" />,
    },
    {
      value: '48h',
      label: '48h',
      tooltip: '48-hour forecast',
      icon: <Today fontSize="small" />,
    },
    {
      value: '7d',
      label: '7d',
      tooltip: '7-day forecast',
      icon: <CalendarToday fontSize="small" />,
    },
    {
      value: '30d',
      label: '30d',
      tooltip: '30-day forecast',
      icon: <DateRange fontSize="small" />,
    },
  ];

  return (
    <Box sx={{ mb: 2 }}>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={handleChange}
        aria-label="forecast horizon"
        disabled={disabled}
        size="small"
        sx={{
          '& .MuiToggleButton-root': {
            px: 2,
            py: 1,
            fontWeight: 'medium',
            '&.Mui-selected': {
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': {
                backgroundColor: 'primary.dark',
              },
            },
          },
        }}
      >
        {horizonOptions.map((option) => (
          <Tooltip key={option.value} title={option.tooltip} arrow>
            <ToggleButton value={option.value} aria-label={option.tooltip}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {option.icon}
                {option.label}
              </Box>
            </ToggleButton>
          </Tooltip>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
};

export default ForecastHorizonToggle;

