// API Keys Configuration
// Add your API keys here directly

export const API_KEYS = {
  // Add your AssemblyAI API key here
  ASSEMBLYAI: 'ca6136aeb7bd444492975b87113f9ec9',
  
  // Add your OpenAI API key here  
  OPENAI: 'YOUR_OPENAI_API_KEY_HERE',
  
  // Gemini key (already working)
  GEMINI: import.meta.env.VITE_GEMINI_API_KEY || ''
};

// Helper function to get API keys
export function getApiKey(service: 'assemblyai' | 'openai' | 'gemini'): string {
  switch (service) {
    case 'assemblyai':
      return API_KEYS.ASSEMBLYAI;
    case 'openai':
      return API_KEYS.OPENAI;
    case 'gemini':
      return API_KEYS.GEMINI;
    default:
      return '';
  }
}

// Check if API key is configured
export function hasApiKey(service: 'assemblyai' | 'openai' | 'gemini'): boolean {
  const key = getApiKey(service);
  return key !== '' && !key.includes('YOUR_') && key.length > 10;
}
