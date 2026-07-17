import BetweenerLoader from '@/components/ui/BetweenerLoader';
import { useAuth, useAuthGuard } from '@/lib/auth-context';
import { Redirect, usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

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
      <BetweenerLoader label="Opening Betweener" sublabel="Restoring your private session." />
    );
  }

  // Redirect based on auth state
  if (needsAuth) {
    return <Redirect href="/(auth)/gate" />;
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
    <BetweenerLoader label="Opening Betweener" sublabel="Preparing your next screen." />
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
  const pathname = usePathname();
  const router = useRouter();
  const segments = useSegments();
  const currentScreen = segments.length > 0 ? segments[segments.length - 1] : null;
  const allowDuringAuthenticatedRecovery =
    currentScreen === 'callback' ||
    currentScreen === 'reset-password' ||
    currentScreen === 'gate' ||
    currentScreen === 'disconnected-provider' ||
    currentScreen === 'retired-duplicate-account' ||
    currentScreen === 'merged-account';
  const shouldRedirectAuthenticatedUser =
    isAuthenticated &&
    isEmailVerified &&
    phoneVerified &&
    hasProfile &&
    !allowDuringAuthenticatedRecovery;

  useEffect(() => {
    if (!shouldRedirectAuthenticatedUser) return;
    if (pathname === '/gate') return;
    router.replace('/gate');
  }, [pathname, router, shouldRedirectAuthenticatedUser]);

  if (isLoading) {
    return (
      <BetweenerLoader label="Opening Betweener" sublabel="Restoring your private session." />
    );
  }

  if (shouldRedirectAuthenticatedUser) {
    return (
      <BetweenerLoader label="Opening your space" sublabel="Taking you back into Betweener." />
    );
  }

  return <>{children}</>;
}
