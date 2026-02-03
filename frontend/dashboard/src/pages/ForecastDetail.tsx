import React from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Box } from '@mui/material';
// Use simple chart to avoid Plotly polyfill issues
// import ForecastChart from '../components/charts/ForecastChart';
import ForecastChart from '../components/charts/ForecastChartSimple';

const ForecastDetail: React.FC = () => {
  const { siteId } = useParams<{ siteId: string }>();

  if (!siteId) {
    return <Container><Typography>Site ID not provided</Typography></Container>;
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Forecast Details
      </Typography>
      <Box sx={{ mt: 3 }}>
        <ForecastChart siteId={siteId} horizon={24} showConfidence={true} />
      </Box>
    </Container>
  );
};

export default ForecastDetail;

