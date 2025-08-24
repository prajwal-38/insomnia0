import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';

interface GoogleSignInProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onGuestLogin?: () => void;
  variant?: 'default' | 'custom';
}

export function GoogleSignIn({ onSuccess, onError, onGuestLogin, variant = 'default' }: GoogleSignInProps) {
  const { loginAsGuest, error, isLoading } = useAuth();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleGuestLogin = () => {
    try {
      setLocalError(null);
      loginAsGuest();
      onGuestLogin?.();
      onSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Guest login failed';
      setLocalError(errorMessage);
      onError?.(errorMessage);
    }
  };

  if (variant === 'custom') {
    return (
      <div className="flex flex-col items-center space-y-4">
        {/* Google OAuth Information Message */}
        <div className="text-center p-4 bg-blue-950/20 border border-blue-800/30 rounded-lg max-w-md">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span className="text-blue-400 font-medium text-sm">Authentication Notice</span>
          </div>
          <p className="text-blue-300 text-sm">
            Google Sign-In is currently available for beta testers only. Please continue as a guest to access all features.
          </p>
        </div>

        {/* Primary Guest Login Button */}
        <div className="relative w-full max-w-[280px]">
          <Button
            onClick={handleGuestLogin}
            variant="outline"
            className="w-full transition-all duration-300 rounded-lg border-0 relative overflow-hidden group"
            style={{
              background: 'linear-gradient(135deg, rgba(64, 224, 208, 0.1) 0%, rgba(255, 105, 180, 0.1) 100%)',
              border: '2px solid rgba(64, 224, 208, 0.6)',
              color: '#40E0D0'
            }}
            disabled={isLoading}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <span className="relative z-10 flex items-center justify-center font-medium">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
              </svg>
              Continue as Guest
            </span>
          </Button>
        </div>

        {(error || localError) && (
          <div className="text-red-400 text-sm text-center max-w-md bg-red-950/20 border border-red-800/30 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error || localError}</span>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center space-x-3 text-cyan-400 bg-cyan-950/20 border border-cyan-800/30 rounded-lg p-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-cyan-400 border-t-transparent"></div>
            <span className="text-sm font-medium">Signing you in...</span>
          </div>
        )}
      </div>
    );
  }

  // Default variant - simple guest login
  return (
    <div className="flex flex-col items-center space-y-4">
      {/* Google OAuth Information Message */}
      <div className="text-center p-3 bg-blue-950/20 border border-blue-800/30 rounded-lg max-w-[280px]">
        <p className="text-blue-300 text-xs">
          Google Sign-In available for beta testers only
        </p>
      </div>

      {/* Primary Guest Login Button */}
      <div className="w-full max-w-[280px]">
        <Button
          onClick={handleGuestLogin}
          variant="outline"
          className="w-full bg-gradient-to-r from-cyan-500/10 to-pink-500/10 border-cyan-500/50 text-cyan-400 hover:border-cyan-400"
          disabled={isLoading}
        >
          Continue as Guest
        </Button>
      </div>

      {(error || localError) && (
        <div className="text-red-500 text-sm text-center max-w-md">
          {error || localError}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center space-x-2 text-cyan-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400"></div>
          <span className="text-sm">Signing in...</span>
        </div>
      )}
    </div>
  );
}

export default GoogleSignIn;
