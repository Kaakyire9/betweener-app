import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';

type Profile = {
  id: string;
  user_id: string;
  full_name: string;
  age: number;
  gender: string;
  bio: string;
  region: string;
  tribe: string;
  religion: string;
  avatar_url: string | null;
  min_age_interest: number;
  max_age_interest: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Photo upload and profile editing fields
  occupation?: string;
  education?: string;
  height?: string;
  looking_for?: string;
  photos?: string[];
  // HIGH PRIORITY lifestyle fields
  exercise_frequency?: string;
  smoking?: string;
  drinking?: string;
  // HIGH PRIORITY family fields
  has_children?: string;
  wants_children?: string;
  // HIGH PRIORITY personality fields
  personality_type?: string;
  love_language?: string;
  // HIGH PRIORITY living situation fields
  living_situation?: string;
  pets?: string;
  // HIGH PRIORITY languages field
  languages_spoken?: string[];
  // DIASPORA fields
  current_country?: string;
  diaspora_status?: 'LOCAL' | 'DIASPORA' | 'VISITING';
  willing_long_distance?: boolean;
  verification_level?: number;
  years_in_diaspora?: number;
  last_ghana_visit?: string;
  future_ghana_plans?: string;
};

type AuthContextType = {
  // Auth State
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  
  // Loading States
  isLoading: boolean;
  isAuthenticating: boolean;
  
  // Auth Status
  isAuthenticated: boolean;
  hasProfile: boolean;
  isEmailVerified: boolean;
  
  // Auth Actions
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  
  // Profile Actions
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Computed states
  const isAuthenticated = !!session && !!user;
  const hasProfile = !!profile;
  const isEmailVerified = !!user?.email_confirmed_at;

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session:', session?.user?.id, session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event, 'User ID:', session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Fetch user profile
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        return;
      }

      setProfile(data || null);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const signIn = async (email: string, password: string) => {
    setIsAuthenticating(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    setIsAuthenticating(true);
    try {
      // Use custom scheme for deep linking
      const redirectUrl = 'betweenerapp://auth/callback';
      console.log('Using redirect URL:', redirectUrl);

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      return { error };
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('No user found') };

    try {
      // Use upsert for profile creation/updates to handle both scenarios
      const { error } = await supabase
        .from('profiles')
        .upsert({
          ...updates,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (!error) {
        await refreshProfile();
      }

      return { error };
    } catch (error) {
      console.error('Profile update error:', error);
      return { error: error as Error };
    }
  };

  const value: AuthContextType = {
    // State
    session,
    user,
    profile,
    isLoading,
    isAuthenticating,
    
    // Computed
    isAuthenticated,
    hasProfile,
    isEmailVerified,
    
    // Actions
    signIn,
    signUp,
    signOut,
    refreshProfile,
    updateProfile,
  };

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

// Auth guard hook for protected routes
export function useAuthGuard() {
  const { isAuthenticated, isLoading, isEmailVerified, hasProfile } = useAuth();
  
  return {
    isLoading,
    needsAuth: !isAuthenticated,
    needsEmailVerification: isAuthenticated && !isEmailVerified,
    needsProfileSetup: isAuthenticated && isEmailVerified && !hasProfile,
    canAccessApp: isAuthenticated && isEmailVerified && hasProfile,
  };
}