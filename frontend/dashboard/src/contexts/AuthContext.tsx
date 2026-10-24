import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

export interface UserProfile {
  id: string;
  email: string;
  role: string;
  tenant_id: string | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserProfile | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Best-effort profile from JWT when /me is briefly unavailable (role claim for Admin nav). */
function profileFromToken(token: string): UserProfile | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const payload = JSON.parse(atob(padded + pad));
    if (!payload?.sub) return null;
    return {
      id: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : '',
      role: typeof payload.role === 'string' ? payload.role : 'user',
      tenant_id: payload.tenant_id != null ? String(payload.tenant_id) : null,
    };
  } catch {
    return null;
  }
}

async function fetchMe(token: string): Promise<UserProfile> {
  const response = await axios.get(`${API_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    id: String(response.data.id),
    email: response.data.email || '',
    role: response.data.role || 'user',
    tenant_id: response.data.tenant_id != null ? String(response.data.tenant_id) : null,
  };
}

function isUnauthorized(err: unknown): boolean {
  return Boolean(axios.isAxiosError(err) && err.response?.status === 401);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  const login = useCallback(async (token: string) => {
    localStorage.setItem('access_token', token);
    setIsAuthenticated(true);
    try {
      const profile = await fetchMe(token);
      setUser(profile);
    } catch (err) {
      if (isUnauthorized(err)) {
        localStorage.removeItem('access_token');
        setIsAuthenticated(false);
        setUser(null);
        throw err;
      }
      // Keep session; use JWT claims so Admin nav still gates correctly
      setUser(profileFromToken(token));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        if (!cancelled) {
          setIsAuthenticated(false);
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      setIsAuthenticated(true);
      try {
        const profile = await fetchMe(token);
        if (!cancelled) {
          setUser(profile);
        }
      } catch (err) {
        if (cancelled) return;
        if (isUnauthorized(err)) {
          localStorage.removeItem('access_token');
          setIsAuthenticated(false);
          setUser(null);
        } else {
          // Network / 5xx: keep token; fall back to JWT role claim
          setUser(profileFromToken(token));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
