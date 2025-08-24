// Test API connection functionality
import { checkApiHealth, getApiBaseUrl, getCurrentEnvironment } from './config/environment';

export async function testApiConnection() {
  console.log('🧪 Testing API connection...');
  
  try {
    // Test environment detection
    const env = getCurrentEnvironment();
    console.log('✅ Environment detected:', env);
    
    // Test API URL
    const apiUrl = getApiBaseUrl();
    console.log('✅ API URL:', apiUrl);
    
    // Test health check
    const isHealthy = await checkApiHealth();
    console.log('✅ API health check:', isHealthy ? 'HEALTHY' : 'UNHEALTHY');
    
    if (!isHealthy) {
      // Try direct fetch as fallback
      console.log('🔄 Trying direct fetch...');
      const response = await fetch(`${apiUrl}/api/health`);
      const data = await response.json();
      console.log('✅ Direct fetch result:', data);
    }
    
    return isHealthy;
  } catch (error) {
    console.error('❌ API connection test failed:', error);
    return false;
  }
}

// Auto-run test in development
if (getCurrentEnvironment() === 'development') {
  testApiConnection().then(result => {
    console.log('🎯 API connection test result:', result ? 'PASS' : 'FAIL');
  });
}
