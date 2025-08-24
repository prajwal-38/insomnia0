import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  googleId: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  login: (credential: string) => Promise<void>;
  loginAsGuest: () => void;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Guest session key for localStorage
const GUEST_SESSION_KEY = 'insomnia_guest_session';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  const isAuthenticated = !!user;

  // Check for existing guest session on mount
  useEffect(() => {
    const checkExistingSession = () => {
      try {
        // Check for guest session in localStorage
        const guestSession = localStorage.getItem(GUEST_SESSION_KEY);
        if (guestSession) {
          const sessionData = JSON.parse(guestSession);
          // Verify session is still valid (not expired)
          if (sessionData.timestamp && Date.now() - sessionData.timestamp < 30 * 24 * 60 * 60 * 1000) { // 30 days
            setIsGuest(true);
            console.log('✅ Restored guest session');
          } else {
            // Session expired, remove it
            localStorage.removeItem(GUEST_SESSION_KEY);
          }
        }
      } catch (error) {
        console.error('Error checking existing guest session:', error);
        localStorage.removeItem(GUEST_SESSION_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    checkExistingSession();
  }, []);

  const login = async (credential: string) => {
    // Google OAuth login is no longer supported
    throw new Error('Google OAuth authentication is not available. Please use guest mode.');
  };

  const loginAsGuest = () => {
    setIsGuest(true);
    setUser(null);
    setError(null);
    setIsLoading(false);

    // Store guest session in localStorage for persistence
    const guestSession = {
      timestamp: Date.now(),
      isGuest: true
    };
    localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(guestSession));

    console.log('✅ Logged in as guest');
  };

  const logout = () => {
    Cookies.remove('auth_token');
    setUser(null);
    setError(null);
    setIsGuest(false);

    // Clear guest session and project-related localStorage data
    localStorage.removeItem(GUEST_SESSION_KEY);
    localStorage.removeItem('storyboard-current-project-id');

    // Redirect to home page
    window.location.href = '/';
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    isGuest,
    login,
    loginAsGuest,
    logout,
    error,
  };

  // Always run in guest-only mode
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
