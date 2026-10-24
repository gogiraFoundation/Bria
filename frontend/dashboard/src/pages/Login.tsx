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
const ALLOW_REGISTRATION =
  (process.env.REACT_APP_ALLOW_REGISTRATION || '').toLowerCase() === 'true';

const Login: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const formatError = (err: any, fallback: string) => {
    if (err.response) {
      const detail = err.response.data?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        return detail
          .map((e: any) => {
            if (typeof e === 'string') return e;
            if (e.msg) return e.msg;
            if (e.message) return e.message;
            return JSON.stringify(e);
          })
          .join(', ');
      }
      if (detail && typeof detail === 'object') {
        return detail.message || detail.error || JSON.stringify(detail);
      }
      if (err.response.data?.message) return err.response.data.message;
    }
    if (err.request) {
      return 'Cannot connect to server. Please check if the API Gateway is running.';
    }
    return err.message || fallback;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await axios.post(`${API_URL}/v1/auth/token`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const token = response.data.access_token;
      try {
        await login(token);
      } catch {
        setError('Session could not be established. Please try again.');
        return;
      }
      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      setError(formatError(err, 'Sign in failed'));
    } finally {
      setSubmitting(false);
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

    setSubmitting(true);
    try {
      const response = await axios.post(`${API_URL}/v1/auth/register`, {
        email,
        password,
        username: username || email.split('@')[0],
        full_name: fullName || username || email.split('@')[0],
      });

      if (response.data.access_token) {
        await login(response.data.access_token);
        navigate('/');
      } else {
        setSuccess('Registration successful. Please sign in.');
        setTab(0);
        setPassword('');
        setUsername('');
        setFullName('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(formatError(err, 'Registration failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'background.default',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography
            variant="h3"
            component="h1"
            align="center"
            sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: '-0.02em' }}
          >
            Bria
          </Typography>
          <Typography variant="body1" color="text.secondary" align="center" sx={{ mt: 1, mb: 3 }}>
            Renewable generation forecasts
          </Typography>

          {ALLOW_REGISTRATION ? (
            <Tabs
              value={tab}
              onChange={(_, v) => {
                setTab(v);
                setError('');
                setSuccess('');
              }}
              sx={{ mb: 3 }}
            >
              <Tab label="Sign in" />
              <Tab label="Register" />
            </Tabs>
          ) : null}

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
                autoComplete="email"
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
                autoComplete="current-password"
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={submitting}
                sx={{ mt: 3, mb: 1 }}
              >
                Sign in
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
                label="Full name (optional)"
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
                label="Confirm password"
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
                disabled={submitting}
                sx={{ mt: 3, mb: 1 }}
              >
                Register
              </Button>
            </form>
          )}
        </Paper>
      </Container>
    </Box>
  );
};

export default Login;
