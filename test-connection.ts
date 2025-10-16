import { supabase } from './lib/supabase';

export async function testSupabaseConnection() {
  try {
    console.log('Testing Supabase connection...');
    
    // Test basic connection
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    
    if (error) {
      console.error('Supabase connection error:', error.message);
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
    
    console.log('Supabase connection successful!');
    return {
      success: true,
      message: 'Connected to Supabase successfully'
    };
    
  } catch (err) {
    console.error('Network connectivity error:', err);
    return {
      success: false,
      error: 'Network request failed',
      details: err
    };
  }
}

// Test environment variables
export function testEnvironmentVariables() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  
  console.log('Environment Variables:');
  console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.log('SUPABASE_ANON_KEY:', supabaseKey ? 'Set' : 'Missing');
  
  return {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
    urlValid: supabaseUrl?.startsWith('https://'),
    keyValid: supabaseKey?.startsWith('eyJ')
  };
}