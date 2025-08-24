// src/config/environment.ts
// Environment configuration for production deployments

export interface ApiConfig {
  baseURL: string;
  timeout: number;
  retries: number;
}

export interface EnvironmentConfig {
  api: ApiConfig;
  features: {
    realTimeSync: boolean;
    aiProcessing: boolean;
    videoExport: boolean;
    cloudStorage: boolean;
  };
  limits: {
    maxVideoSize: number; // in MB
    maxVideoDuration: number; // in seconds
    maxConcurrentProcessing: number;
  };
}

// Environment-specific configurations
export const ENVIRONMENT_CONFIGS: Record<string, EnvironmentConfig> = {
  development: {
    api: {
      baseURL: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:8080',
      timeout: 30000,
      retries: 3
    },
    features: {
      realTimeSync: true,
      aiProcessing: true,
      videoExport: true,
      cloudStorage: false
    },
    limits: {
      maxVideoSize: 100, // 100MB for development
      maxVideoDuration: 300, // 5 minutes
      maxConcurrentProcessing: 2
    }
  },
  
  production: {
    api: {
      baseURL: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://34.142.155.4:8080',
      timeout: 60000,
      retries: 5
    },
    features: {
      realTimeSync: true,
      aiProcessing: true,
      videoExport: true,
      cloudStorage: true
    },
    limits: {
      maxVideoSize: 500, // 500MB for production
      maxVideoDuration: 1800, // 30 minutes
      maxConcurrentProcessing: 5
    }
  },

  // Production deployment configuration
  production: {
    api: {
      baseURL: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'https://insomnia-backend-production.run.app',
      timeout: 60000,
      retries: 5
    },
    features: {
      realTimeSync: true,
      aiProcessing: true,
      videoExport: true,
      cloudStorage: true
    },
    limits: {
      maxVideoSize: 1000, // 1GB for production
      maxVideoDuration: 3600, // 60 minutes
      maxConcurrentProcessing: 10
    }
  },
  
  staging: {
    api: {
      baseURL: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'https://staging-backend-url.com',
      timeout: 45000,
      retries: 3
    },
    features: {
      realTimeSync: true,
      aiProcessing: true,
      videoExport: true,
      cloudStorage: true
    },
    limits: {
      maxVideoSize: 200, // 200MB for staging
      maxVideoDuration: 600, // 10 minutes
      maxConcurrentProcessing: 3
    }
  }
};

// Detect current environment
export const getCurrentEnvironment = (): string => {
  try {
    // Check for explicit environment variable (Vite uses import.meta.env)
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENVIRONMENT) {
      return import.meta.env.VITE_ENVIRONMENT;
    }

    if (typeof import.meta !== 'undefined' && import.meta.env?.NODE_ENV) {
      return import.meta.env.NODE_ENV;
    }

    // Check for Vercel environment (hybrid deployment)
    if (typeof import.meta !== 'undefined' && import.meta.env?.VERCEL_ENV) {
      return import.meta.env.VERCEL_ENV === 'production' ? 'production' : 'staging';
    }

    // Check hostname patterns
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;

      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
      }

      // Production patterns
      if (hostname.includes('.run.app') || hostname.includes('.vercel.app')) {
        return 'production';
      }

      if (hostname.includes('staging') || hostname.includes('dev')) {
        return 'staging';
      }

      return 'production';
    }

    return 'development';
  } catch (error) {
    console.warn('Error detecting environment, defaulting to development:', error);
    return 'development';
  }
};

// Get current configuration
export const getEnvironmentConfig = (): EnvironmentConfig => {
  const env = getCurrentEnvironment();
  return ENVIRONMENT_CONFIGS[env] || ENVIRONMENT_CONFIGS.development;
};

// Convenience functions
export const getApiBaseUrl = (): string => {
  return getEnvironmentConfig().api.baseURL;
};

export const getApiTimeout = (): number => {
  return getEnvironmentConfig().api.timeout;
};

export const isFeatureEnabled = (feature: keyof EnvironmentConfig['features']): boolean => {
  return getEnvironmentConfig().features[feature];
};

export const getLimit = (limit: keyof EnvironmentConfig['limits']): number => {
  return getEnvironmentConfig().limits[limit];
};

// API endpoint builder
export const buildApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${cleanEndpoint}`;
};

// Health check function with proper timeout handling
export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(buildApiUrl('/api/health'), {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
};

// Environment info for debugging
export const getEnvironmentInfo = () => {
  const env = getCurrentEnvironment();
  const config = getEnvironmentConfig();
  
  return {
    environment: env,
    apiBaseUrl: config.api.baseURL,
    features: config.features,
    limits: config.limits,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    timestamp: new Date().toISOString()
  };
};

// Log environment info (always in development, limited in production)
try {
  const currentEnv = getCurrentEnvironment();
  console.log('🌍 Environment Info:', getEnvironmentInfo());
  console.log('🔧 import.meta.env available:', typeof import.meta !== 'undefined');
  if (typeof import.meta !== 'undefined') {
    console.log('🔧 import.meta.env.NODE_ENV:', import.meta.env?.NODE_ENV);
    console.log('🔧 import.meta.env.VITE_API_URL:', import.meta.env?.VITE_API_URL);
    console.log('🔧 import.meta.env.VITE_ENVIRONMENT:', import.meta.env?.VITE_ENVIRONMENT);
  }
} catch (error) {
  console.warn('⚠️ Error logging environment info:', error);
}

// Types are already exported above
