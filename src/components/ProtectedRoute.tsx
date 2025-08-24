import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function ProtectedRoute({ children, requireAuth = true }: ProtectedRouteProps) {
  const { isAuthenticated, isGuest, isLoading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  // If authentication is required but user is not authenticated and not a guest
  if (requireAuth && !isAuthenticated && !isGuest) {
    // Redirect to home page with the intended destination
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // If user is authenticated, guest, or authentication is not required
  return <>{children}</>;
}

export default ProtectedRoute;
