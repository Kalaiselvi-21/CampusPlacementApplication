import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../config/api';

const AuthContext = createContext();

const normalizeRole = (role) => {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (normalized === 'placementofficer') return 'placement_officer';
  if (normalized === 'placementrepresentative') return 'placement_representative';
  return normalized;
};

const normalizeUser = (user) => {
  if (!user) return user;
  return {
    ...user,
    role: normalizeRole(user.role)
  };
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const navEntry = performance.getEntriesByType('navigation')[0];
      const isReload = navEntry?.type === 'reload' || performance.navigation?.type === 1;

      // Product requirement: refreshing any authenticated page should return user to login.
      if (isReload) {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('token');
      if (token && token !== 'null' && token !== 'undefined') {
        try {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          // Verify token and get user data
          const response = await axios.get(`${API_BASE}/api/auth/me`);
          setUser(normalizeUser(response.data.user));
        } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API_BASE}/api/auth/login`, {
        email,
        password
      });

      const { token, user } = response.data;
      
      // Store token properly
      if (token && token !== 'null' && token !== 'undefined') {
        localStorage.setItem('token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        const normalizedUser = normalizeUser(user);
        setUser(normalizedUser);
        return { user: normalizedUser }; // Return user for Login component
      } else {
        throw new Error('Invalid token received');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error; // Re-throw for Login component to handle
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    setUser(normalizeUser(updatedUser));
  };

  const checkConsentStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await axios.get(`${API_BASE}/api/placement-consent/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.data;
    } catch (error) {
      console.error('Error checking consent status:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      updateUser, 
      loading,
      checkConsentStatus
    }}>
      {children}
    </AuthContext.Provider>
  );
};





