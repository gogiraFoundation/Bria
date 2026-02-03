import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
} from '@mui/material';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const ChangePassword: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        navigate('/login');
        return;
      }

      await axios.post(
        `${API_URL}/v1/auth/change-password`,
        {
          current_password: currentPassword,
          new_password: newPassword,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      } else {
        const errorMessage = err.response?.data?.detail;
        if (typeof errorMessage === 'string') {
          setError(errorMessage);
        } else if (Array.isArray(errorMessage)) {
          setError(errorMessage.map((e: any) => e.msg || JSON.stringify(e)).join(', '));
        } else if (errorMessage && typeof errorMessage === 'object') {
          setError(JSON.stringify(errorMessage));
        } else {
          setError('Password change failed');
        }
      }
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom align="center">
            Change Password
          </Typography>
          
          {error && (
            <Alert severity="error" sx={{ mb: 2, mt: 2 }}>
              {String(error)}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2, mt: 2 }}>
              {String(success)}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              margin="normal"
              required
              helperText="Minimum 6 characters"
            />
            <TextField
              fullWidth
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              margin="normal"
              required
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Change Password
            </Button>
            <Button
              fullWidth
              variant="outlined"
              onClick={() => navigate('/')}
            >
              Cancel
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
};

export default ChangePassword;

