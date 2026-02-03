import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState("Verifying your email...");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const processingRef = useRef(false);
  const oauthPendingRef = useRef(false);
  const didNavigateRef = useRef(false);

  const hasRunRef = useRef(false);

  const logCallbackError = (error: unknown, context: string) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[auth-callback] ${context}: ${message}`);
  };

  const routeAfterSignIn = async () => {
    if (didNavigateRef.current) return;
    didNavigateRef.current = true;
    router.replace("/(tabs)/vibes");
  };
  
  const exchange = useCallback(async () => {
    // Prevent multiple executions using multiple guards
    if (processingRef.current || hasRunRef.current || isComplete) {
      return;
    }
    
    processingRef.current = true;
    hasRunRef.current = true;
    setIsProcessing(true);
      
      try {
        
        
        // Check current session state first
        const { data: initialSession } = await supabase.auth.getSession();
        
        
        // If already signed in, just redirect to success
        if (initialSession?.session) {
          setStatus("Already verified! Redirecting...");
          setIsComplete(true);
          setTimeout(() => {
            router.replace("/(auth)/verify-email?verified=true");
          }, 500);
          return;
        }
        
        const mergeUrlParamsFromUrl = (target: Record<string, any>, url: string) => {
          if (url.includes('#')) {
            const fragmentPart = url.split('#')[1];
            if (fragmentPart) {
              try {
                const fragmentParams = new URLSearchParams(fragmentPart);
                const fragmentEntries = Object.fromEntries(fragmentParams.entries());
                Object.keys(fragmentEntries).forEach((key) => {
                  target[key] = fragmentEntries[key];
                });
              } catch {
                // ignore parse errors
              }
            }
          }

          if (url.includes('?')) {
            let queryPart = url.split('?')[1];
            if (queryPart.includes('#')) {
              queryPart = queryPart.split('#')[0];
            }
            if (queryPart) {
              try {
                const queryParams = new URLSearchParams(queryPart);
                const queryEntries = Object.fromEntries(queryParams.entries());
                Object.keys(queryEntries).forEach((key) => {
                  target[key] = queryEntries[key];
                });
              } catch {
                // ignore parse errors
              }
            }
          }
        };

        // Also try to get the URL from the linking event or stored URL
        let urlParams: any = { ...params };
        let currentUrl: string | null = null;
        
        try {
          // Try to get the initial URL first
          const initialUrl = await Linking.getInitialURL();
          
          
          // If no initial URL, try to get from stored deep link URL
          if (!initialUrl || !initialUrl.includes('access_token')) {
            const storedUrl = await AsyncStorage.getItem('last_deep_link_url');
            
            if (storedUrl && storedUrl.includes('access_token')) {
              currentUrl = storedUrl;
              // Clear it so it doesn't get reused
              await AsyncStorage.removeItem('last_deep_link_url');
            }
          }
          
          if (initialUrl) {
            const hasAuthPayload =
              initialUrl.includes('access_token=') ||
              initialUrl.includes('refresh_token=') ||
              initialUrl.includes('code=') ||
              initialUrl.includes('token_hash=');
            if (hasAuthPayload) {
              currentUrl = initialUrl;
            }
          }
          
          
          
          if (currentUrl && (currentUrl.includes('#') || currentUrl.includes('?'))) {
            mergeUrlParamsFromUrl(urlParams, currentUrl);
          }
        } catch (urlError) {
          
        }
        
        
        
        // Check for different token types from URL fragments or query params
        const access_token = urlParams.access_token as string | undefined;
        const refresh_token = urlParams.refresh_token as string | undefined;
        const code = urlParams.code as string | undefined;
        const token_hash = urlParams.token_hash as string | undefined;
        const error_description = urlParams.error_description as string | undefined;
        const error_code = urlParams.error_code as string | undefined;
        const type = urlParams.type as string | undefined;
        const test = urlParams.test as string | undefined;
        const provider_token = urlParams.provider_token as string | undefined;
        
        

        const hasAuthParams =
          !!urlParams.access_token ||
          !!urlParams.refresh_token ||
          !!urlParams.code ||
          !!urlParams.token_hash;

        if (!hasAuthParams) {
          await new Promise(resolve => setTimeout(resolve, 300));
          const retryUrl = await AsyncStorage.getItem('last_deep_link_url');
          if (retryUrl && retryUrl !== currentUrl && (retryUrl.includes('#') || retryUrl.includes('?'))) {
            mergeUrlParamsFromUrl(urlParams, retryUrl);
          }
        }

        // Handle error cases first
        if (error_description || error_code) {
          const errorMsg = error_description || `Error code: ${error_code}`;
          logCallbackError(errorMsg, "oauth_error");
          Alert.alert("Verification Error", errorMsg);
          router.replace(`/(auth)/verify-email?error=${encodeURIComponent(errorMsg)}`);
          return;
        }

        // Handle token_hash verification (Supabase email confirmation)
        if (token_hash && type) {
          setStatus("Verifying email confirmation...");
          
          
          try {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash,
              type: type as any,
            });
            
            if (error) {
              
              
              // Handle rate limiting specifically
              if (error.message.includes("rate limit")) {
                
                setStatus("Checking authentication status...");
                
                // Wait a moment then check session
                await new Promise(resolve => setTimeout(resolve, 1000));
                const { data: session } = await supabase.auth.getSession();
                
                if (session?.session) {
                  
                  setStatus("Email verified successfully! Redirecting...");
                  setTimeout(() => {
                    router.replace("/(auth)/verify-email?verified=true");
                  }, 500);
                  return;
                } else {
                  
                  Alert.alert("Too Many Attempts", "Please wait a moment and try clicking the email link again.");
                  router.replace(`/(auth)/verify-email?error=${encodeURIComponent("Rate limit reached")}`);
                  return;
                }
              }
              
              // For other errors, check if user is actually signed in
              const { data: session } = await supabase.auth.getSession();
              if (session?.session) {
              
                setStatus("Email verified successfully! Redirecting...");
                setTimeout(() => {
                  router.replace("/(auth)/verify-email?verified=true");
                }, 500);
                return;
              }
              
              // Only show error if no session exists
              
              logCallbackError(error, "token_hash_verify");
              Alert.alert("Verification Error", error.message);
              router.replace(`/(auth)/verify-email?error=${encodeURIComponent(error.message)}`);
              return;
            } 
            
            if (data?.session) {
              
              setStatus("Email verified successfully! Redirecting...");
              
              // Small delay to show success message
              setTimeout(() => {
                router.replace("/(auth)/verify-email?verified=true");
              }, 1000);
              await AsyncStorage.removeItem("last_deep_link_url");
              return;
            } 
            
            // Check if session exists even without explicit session in response
            const { data: currentSession } = await supabase.auth.getSession();
            if (currentSession?.session) {
              
              setStatus("Email verified successfully! Redirecting...");
              setTimeout(() => {
                router.replace("/(auth)/verify-email?verified=true");
              }, 500);
              await AsyncStorage.removeItem("last_deep_link_url");
              return;
            }
            
            
            router.replace("/(auth)/verify-email?error=No session created");
            return;
          } catch (tokenError) {
            logCallbackError(tokenError, "token_hash_verify_exception");
            
            // Handle rate limiting in catch block too
            if (tokenError instanceof Error && tokenError.message.includes("rate limit")) {
              
              setStatus("Too many requests, checking status...");
              
              await new Promise(resolve => setTimeout(resolve, 1000));
              try {
                const { data: session } = await supabase.auth.getSession();
                if (session?.session) {
                  
                  setStatus("Email verified successfully! Redirecting...");
                  setTimeout(() => {
                    router.replace("/(auth)/verify-email?verified=true");
                  }, 500);
                  return;
                }
              } catch (sessionError) {
                
              }
              
              Alert.alert("Too Many Attempts", "Please wait a moment before trying again.");
              router.replace("/(auth)/verify-email?error=Rate limit reached");
              return;
            }
            
            // For other exceptions, check if user is signed in
            try {
              const { data: session } = await supabase.auth.getSession();
              if (session?.session) {
                
                setStatus("Email verified successfully! Redirecting...");
                setTimeout(() => {
                  router.replace("/(auth)/verify-email?verified=true");
                }, 500);
                await AsyncStorage.removeItem("last_deep_link_url");
                return;
              }
            } catch (sessionError) {
              
            }
            
            router.replace("/(auth)/verify-email?error=Failed to verify email");
            return;
          }
        }
        // Handle direct token response (URL fragments - for other auth flows)
        else if (access_token && refresh_token) {
          const isOAuthFlow = !!provider_token && !type;
          setStatus(isOAuthFlow ? "Signing you in..." : "Processing authentication tokens...");
          
          oauthPendingRef.current = isOAuthFlow;
          
          try {
            // Set the session directly using the tokens
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            
            
            if (error) {
              logCallbackError(error, "set_session");
              Alert.alert("Verification Error", error.message);
              router.replace(`/(auth)/verify-email?error=${encodeURIComponent(error.message)}`);
              return;
            }

            if (isOAuthFlow) {
              
              setIsComplete(true);
              setStatus("Signed in! Redirecting...");
              await routeAfterSignIn();
              await AsyncStorage.removeItem("last_deep_link_url");
              return;
              setTimeout(async () => {
                const { data: fallbackSession } = await supabase.auth.getSession();
                if (fallbackSession?.session) {
                  await routeAfterSignIn();
                }
              }, 600);
              return;
            }

            let session = data?.session ?? null;
            if (!session) {
              const { data: freshSession } = await supabase.auth.getSession();
              session = freshSession?.session ?? null;
            }

            if (session) {
              
              setIsComplete(true);
              setStatus("Email verified successfully! Redirecting...");
              router.replace("/(auth)/verify-email?verified=true");
              await AsyncStorage.removeItem("last_deep_link_url");
              return;
            }
            
            
            router.replace("/(auth)/verify-email?error=No session created");
          } catch (tokenError) {
            logCallbackError(tokenError, "set_session_exception");
            router.replace("/(auth)/verify-email?error=Failed to process verification tokens");
          }
        }
        // Handle code exchange (traditional OAuth flow)
        else if (code) {
          setStatus("Exchanging verification code...");
          
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            logCallbackError(error, "exchange_code");
            Alert.alert("Verification Error", error.message);
            router.replace(`/(auth)/verify-email?error=${encodeURIComponent(error.message)}`);
          } else if (data?.session) {
            
            setStatus("Email verified successfully! Redirecting...");
            
            // Small delay to show success message
            setTimeout(() => {
              router.replace("/(auth)/verify-email?verified=true");
            }, 1000);
            await AsyncStorage.removeItem("last_deep_link_url");
          } else {
            
            router.replace("/(auth)/verify-email?error=No session created");
          }
        } else if (test) {
          
          Alert.alert("Deep Link Test", `Deep linking is working! Test parameter: ${test}`);
          router.replace("/(auth)/verify-email?verified=test");
        } else {
          setStatus("Finalizing sign-in...");
          let resolvedSession = null;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 400));
            const { data: fallbackSession } = await supabase.auth.getSession();
            if (fallbackSession?.session) {
              resolvedSession = fallbackSession.session;
              break;
            }
          }
          if (resolvedSession) {
            await routeAfterSignIn();
            return;
          }

          Alert.alert("No Verification Data", "No verification tokens, token_hash, or code found in the URL.");
          router.replace("/(auth)/verify-email?error=No verification data found");
        }
      } catch (err) {
        logCallbackError(err, "callback_exception");
        const errorMsg = err instanceof Error ? err.message : "Unexpected error";
        Alert.alert("Verification Error", errorMsg);
        router.replace(`/(auth)/verify-email?error=${encodeURIComponent(errorMsg)}`);
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    }, []);

  useEffect(() => {
    // Run once when component mounts
    if (!hasRunRef.current) {
      exchange();
    }
  }, []); // Empty dependency array - run only once

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        setIsComplete(true);
        setStatus("Signed in! Redirecting...");
        void routeAfterSignIn();
        setTimeout(() => {
          if (!didNavigateRef.current) {
            router.replace("/(auth)/onboarding");
          }
        }, 2000);
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <View style={{ 
      flex: 1, 
      justifyContent: "center", 
      alignItems: "center",
      backgroundColor: "#F8FAFC",
      padding: 24
    }}>
      <ActivityIndicator size="large" color="#0FBAB5" />
      <Text style={{ 
        marginTop: 16, 
        color: "#64748B",
        textAlign: "center",
        fontSize: 16,
        fontFamily: "Manrope_400Regular"
      }}>
        {status}
      </Text>
      {isProcessing && (
        <Text style={{ 
          marginTop: 8, 
          color: "#94A3B8",
          textAlign: "center",
          fontSize: 14,
          fontStyle: "italic"
        }}>
          Processing verification...
        </Text>
      )}
      {isComplete && (
        <Text style={{ 
          marginTop: 8, 
          color: "#10B981",
          textAlign: "center",
          fontSize: 14,
          fontWeight: "600"
        }}>
          ✓ Complete
        </Text>
      )}
    </View>
  );
}
