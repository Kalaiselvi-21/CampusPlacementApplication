import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const normalizeRole = (role) =>
  String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

const getDashboardRoute = (role) => {
  const normalized = normalizeRole(role);

  if (normalized === 'student') {
    return '/student-dashboard';
  }

  if (normalized === 'placement_representative' || normalized === 'pr') {
    return '/pr-dashboard';
  }

  if (normalized === 'placement_officer' || normalized === 'po') {
    return '/po-dashboard';
  }

  return '/dashboard';
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role));
    const userRole = normalizeRole(user.role);

    if (!normalizedAllowedRoles.includes(userRole)) {
      return <Navigate to={getDashboardRoute(userRole)} replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
















