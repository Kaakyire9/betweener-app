import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

export function AuthDebugPanel() {
  const { user, isAuthenticated, isEmailVerified } = useAuth();
  const [debugInfo, setDebugInfo] = useState('');

  const testAuth = async () => {
    try {
      // Test 1: Check auth context
      // Test 2: Check direct Supabase session
      const { data: { session: directSession }, error: sessionError } = await supabase.auth.getSession();
      // Test 3: Check direct user
      const { data: { user: directUser }, error: userError } = await supabase.auth.getUser();
      // Test 4: Try a simple database query
      const { error: dbError } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);

      const info = `
Context User: ${user?.id || 'None'}
Context Email: ${user?.email || 'None'}
Is Authenticated: ${isAuthenticated}
Is Email Verified: ${isEmailVerified}
Direct Session: ${directSession?.user?.id || 'None'}
Direct User: ${directUser?.id || 'None'}
Session Error: ${sessionError?.message || 'None'}
User Error: ${userError?.message || 'None'}
DB Error: ${dbError?.message || 'None'}
      `;
      
      setDebugInfo(info);
      Alert.alert('Auth Debug Info', info);
    } catch (error: any) {
      Alert.alert('Debug Error', error.message);
    }
  };

  if (!__DEV__) return null;

  return (
    <View style={{ padding: 16, backgroundColor: '#f0f0f0', margin: 16, borderRadius: 8 }}>
      <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>🔍 Auth Debug Panel</Text>
      <TouchableOpacity
        onPress={testAuth}
        style={{ backgroundColor: '#007AFF', padding: 8, borderRadius: 4, marginBottom: 8 }}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>Test Auth Status</Text>
      </TouchableOpacity>
      {debugInfo ? (
        <Text style={{ fontSize: 10, fontFamily: 'monospace' }}>{debugInfo}</Text>
      ) : null}
    </View>
  );
}
