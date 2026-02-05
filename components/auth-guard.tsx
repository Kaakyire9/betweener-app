import { useAuth, useAuthGuard } from '@/lib/auth-context';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

type AuthGuardProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { 
    isLoading, 
    needsAuth, 
    needsEmailVerification, 
    needsPhoneVerification,
    needsProfileSetup,
    canAccessApp 
  } = useAuthGuard();
  
  // Show loading spinner while checking auth
  if (isLoading) {
    return fallback || (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  // Redirect based on auth state
  if (needsAuth) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (needsEmailVerification) {
    return <Redirect href="/(auth)/verify-email" />;
  }

  if (needsPhoneVerification) {
    return <Redirect href="/(auth)/verify-phone" />;
  }

  if (needsProfileSetup) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  // User is fully authenticated and set up
  if (canAccessApp) {
    return <>{children}</>;
  }

  // Fallback loading state
  return fallback || (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#FF6B6B" />
    </View>
  );
}

// Protected route wrapper for individual screens
export function withAuthGuard<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  return function AuthGuardedComponent(props: P) {
    return (
      <AuthGuard fallback={fallback}>
        <Component {...props} />
      </AuthGuard>
    );
  };
}

// Guest-only guard (for auth screens)
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isEmailVerified, hasProfile, phoneVerified, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  // If fully authenticated, redirect to main app
  if (isAuthenticated && isEmailVerified && phoneVerified && hasProfile) {
    return <Redirect href="/(tabs)/vibes" />;
  }

  return <>{children}</>;
}
