import { useAuth } from '@/lib/auth-context';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ProfileDebug() {
  const { profile, refreshProfile } = useAuth();

  if (!__DEV__) return null; // Only show in development

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🐛 Profile Debug</Text>
      <Text style={styles.text}>Updated: {profile?.updated_at || 'Never'}</Text>
      <Text style={styles.text}>Photos: {profile?.photos?.length || 0}</Text>
      <Text style={styles.text}>Occupation: {profile?.occupation || 'None'}</Text>
      <TouchableOpacity style={styles.button} onPress={refreshProfile}>
        <Text style={styles.buttonText}>🔄 Force Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 10,
    borderRadius: 8,
    zIndex: 1000,
  },
  title: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  text: {
    color: 'white',
    fontSize: 10,
    marginTop: 2,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 5,
    borderRadius: 4,
    marginTop: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 10,
    textAlign: 'center',
  },
});