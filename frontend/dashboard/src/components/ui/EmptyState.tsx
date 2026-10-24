import React from 'react';
import { Box, Paper, Typography, Stack } from '@mui/material';

interface EmptyStateProps {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  dense?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, body, action, icon, dense = false }) => {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: dense ? 3 : 6,
        textAlign: 'center',
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={2} alignItems="center" maxWidth={420} mx="auto">
        {icon && (
          <Box sx={{ color: 'text.secondary', display: 'flex', fontSize: 40 }} aria-hidden>
            {icon}
          </Box>
        )}
        <Typography variant="h5" component="h2">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {body}
        </Typography>
        {action && <Box sx={{ pt: 1 }}>{action}</Box>}
      </Stack>
    </Paper>
  );
};

export default EmptyState;
