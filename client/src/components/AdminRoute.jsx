import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AdminRoute = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return <div style={{ padding: '100px', color: 'white' }}>Loading auth...</div>;

  // Check if authenticated and has 'admin' role
  // Note: We assume the backend validates the role securely for API calls.
  // This client-side check is just for UX/Routing.
  // If user.role is missing in AuthContext user object, we might need to fetch it, 
  // but usually AuthContext populates it from public.users.
  
  // Debug role
  // console.log('AdminRoute check:', { isAuthenticated, role: user?.role });

  if (!isAuthenticated || user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default AdminRoute;
