import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

/**
 * Export forecast data for a site
 */
export const exportForecast = async (
  siteId: string,
  format: 'csv' | 'json',
  horizon: string = '24h'
): Promise<void> => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await axios.get(
    `${API_URL}/v1/sites/${siteId}/forecast/export`,
    {
      params: { format, horizon },
      headers: {
        Authorization: `Bearer ${token}`,
      },
      responseType: 'blob',
    }
  );

  // Get filename from Content-Disposition header or generate one
  const contentDisposition = response.headers['content-disposition'];
  let filename = `forecast_${siteId}_${horizon}.${format}`;
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
    if (filenameMatch) {
      filename = filenameMatch[1];
    }
  }

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * Export production history for a site
 */
export const exportProduction = async (
  siteId: string,
  format: 'csv' | 'json',
  startDate?: Date,
  endDate?: Date
): Promise<void> => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    throw new Error('Not authenticated');
  }

  const params: any = { format };
  if (startDate) {
    params.start = startDate.toISOString();
  }
  if (endDate) {
    params.end = endDate.toISOString();
  }

  const response = await axios.get(
    `${API_URL}/v1/sites/${siteId}/production/export`,
    {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      responseType: 'blob',
    }
  );

  // Get filename from Content-Disposition header or generate one
  const contentDisposition = response.headers['content-disposition'];
  let filename = `production_${siteId}.${format}`;
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
    if (filenameMatch) {
      filename = filenameMatch[1];
    }
  }

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

