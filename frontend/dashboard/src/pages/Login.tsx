import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const Login: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await axios.post(
        `${API_URL}/v1/auth/token`,
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const token = response.data.access_token;
      localStorage.setItem('access_token', token);
      login(token); // Update AuthContext state
      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      let errorMessage = 'Login failed';
      
      if (err.response) {
        // Server responded with error
        const detail = err.response.data?.detail;
        if (typeof detail === 'string') {
          errorMessage = detail;
        } else if (Array.isArray(detail)) {
          errorMessage = detail.map((e: any) => {
            if (typeof e === 'string') return e;
            if (e.msg) return e.msg;
            if (e.message) return e.message;
            return JSON.stringify(e);
          }).join(', ');
        } else if (detail && typeof detail === 'object') {
          errorMessage = detail.message || detail.error || JSON.stringify(detail);
        } else if (err.response.data?.message) {
          errorMessage = err.response.data.message;
        }
      } else if (err.message) {
        errorMessage = err.message;
      } else if (err.request) {
        errorMessage = 'Cannot connect to server. Please check if the API Gateway is running.';
      }
      
      setError(errorMessage);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      const response = await axios.post(
        `${API_URL}/v1/auth/register`,
        {
          email,
          password,
          username: username || email.split('@')[0],
          full_name: fullName || username || email.split('@')[0],
        }
      );

      // If registration returns a token, log in automatically
      if (response.data.access_token) {
        const token = response.data.access_token;
        localStorage.setItem('access_token', token);
        login(token); // Update AuthContext state
        navigate('/');
      } else {
        setSuccess('Registration successful! Please login.');
        setTab(0);
        setEmail(email);
        setPassword('');
        setUsername('');
        setFullName('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      let errorMessage = 'Registration failed';
      
      if (err.response) {
        // Server responded with error
        const detail = err.response.data?.detail;
        if (typeof detail === 'string') {
          errorMessage = detail;
        } else if (Array.isArray(detail)) {
          errorMessage = detail.map((e: any) => {
            if (typeof e === 'string') return e;
            if (e.msg) return e.msg;
            if (e.message) return e.message;
            return JSON.stringify(e);
          }).join(', ');
        } else if (detail && typeof detail === 'object') {
          errorMessage = detail.message || detail.error || JSON.stringify(detail);
        } else if (err.response.data?.message) {
          errorMessage = err.response.data.message;
        }
      } else if (err.message) {
        errorMessage = err.message;
      } else if (err.request) {
        errorMessage = 'Cannot connect to server. Please check if the API Gateway is running.';
      }
      
      setError(errorMessage);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography variant="h4" gutterBottom align="center">
            Bria Platform
          </Typography>
          <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 3 }}>
            Renewable Energy Forecasting
          </Typography>
          
          <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(''); setSuccess(''); }} sx={{ mb: 3 }}>
            <Tab label="Login" />
            <Tab label="Register" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {String(error)}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
              {String(success)}
            </Alert>
          )}

          {tab === 0 ? (
            <form onSubmit={handleLogin}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2 }}
              >
                Login
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Username (optional)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                margin="normal"
                helperText="Leave empty to use email prefix"
              />
              <TextField
                fullWidth
                label="Full Name (optional)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
                helperText="Minimum 6 characters"
              />
              <TextField
                fullWidth
                label="Confirm Password"
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
                Register
              </Button>
            </form>
          )}
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;

