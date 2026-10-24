import React from 'react';
import { Box, Breadcrumbs, Link, Typography, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  status?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  status,
  primaryAction,
  secondaryActions,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2,
        mb: 3,
      }}
    >
      <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs sx={{ mb: 1 }} aria-label="breadcrumb">
            {breadcrumbs.map((crumb, index) =>
              crumb.href && index < breadcrumbs.length - 1 ? (
                <Link
                  key={crumb.label}
                  component={RouterLink}
                  to={crumb.href}
                  underline="hover"
                  color="text.secondary"
                  variant="body2"
                >
                  {crumb.label}
                </Link>
              ) : (
                <Typography key={crumb.label} variant="body2" color="text.primary">
                  {crumb.label}
                </Typography>
              )
            )}
          </Breadcrumbs>
        )}
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          {status}
        </Stack>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {(primaryAction || secondaryActions) && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {secondaryActions}
          {primaryAction}
        </Stack>
      )}
    </Box>
  );
};

export default PageHeader;
