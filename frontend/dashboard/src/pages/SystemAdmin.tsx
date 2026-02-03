import React from 'react';
import { Container, Typography } from '@mui/material';

const SystemAdmin: React.FC = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        System Administration
      </Typography>
      <Typography>System administration interface coming soon...</Typography>
    </Container>
  );
};

export default SystemAdmin;

