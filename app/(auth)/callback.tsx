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

  const hasRunRef = useRef(false);
  
  const exchange = useCallback(async () => {
    // Prevent multiple executions using multiple guards
    if (processingRef.current || hasRunRef.current || isComplete) {
      console.log("Callback already processing or completed, skipping...");
      return;
    }
    
    processingRef.current = true;
    hasRunRef.current = true;
    setIsProcessing(true);
      
      try {
        console.log("=== AuthCallback Start ===");
        console.log("AuthCallback received params:", params);
        
        // Check current session state first
        const { data: initialSession } = await supabase.auth.getSession();
        console.log("Initial session state:", initialSession?.session ? "SIGNED IN" : "NOT SIGNED IN");
        
        // If already signed in, just redirect to success
        if (initialSession?.session) {
          console.log("User already signed in, redirecting to success");
          setStatus("Already verified! Redirecting...");
          setIsComplete(true);
          setTimeout(() => {
            router.replace("/(auth)/verify-email?verified=true");
          }, 500);
          return;
        }
        
        // Also try to get the URL from the linking event or stored URL
        let urlParams: any = { ...params };
        let currentUrl: string | null = null;
        
        try {
          // Try to get the initial URL first
          const initialUrl = await Linking.getInitialURL();
          console.log("Initial URL for parsing:", initialUrl);
          
          // If no initial URL, try to get from stored deep link URL
          if (!initialUrl || !initialUrl.includes('access_token')) {
            const storedUrl = await AsyncStorage.getItem('last_deep_link_url');
            console.log("Stored deep link URL:", storedUrl);
            if (storedUrl && storedUrl.includes('access_token')) {
              currentUrl = storedUrl;
              // Clear it so it doesn't get reused
              await AsyncStorage.removeItem('last_deep_link_url');
            }
          }
          
          currentUrl = initialUrl;
          
          console.log("Final URL to parse:", currentUrl);
          console.log("URL contains #:", currentUrl?.includes('#'));
          console.log("URL contains ?:", currentUrl?.includes('?'));
          
          if (currentUrl && (currentUrl.includes('#') || currentUrl.includes('?'))) {
            console.log("Parsing URL:", currentUrl);
            
            // Parse fragments (after #) manually - this is the main case for Supabase
            if (currentUrl.includes('#')) {
              const fragmentPart = currentUrl.split('#')[1];
              console.log("Fragment part:", fragmentPart);
              
              if (fragmentPart) {
                try {
                  const fragmentParams = new URLSearchParams(fragmentPart);
                  const fragmentEntries = Object.fromEntries(fragmentParams.entries());
                  console.log("Parsed fragment params:", fragmentEntries);
                  
                  // Merge fragment params with url params
                  Object.keys(fragmentEntries).forEach((key) => {
                    urlParams[key] = fragmentEntries[key];
                  });
                } catch (e) {
                  console.log("Fragment parsing error:", e);
                }
              }
            }
            
            // Also parse query params manually (after ? but before #)
            if (currentUrl.includes('?')) {
              let queryPart = currentUrl.split('?')[1];
              // Remove fragment part if it exists
              if (queryPart.includes('#')) {
                queryPart = queryPart.split('#')[0];
              }
              
              console.log("Query part:", queryPart);
              
              if (queryPart) {
                try {
                  const queryParams = new URLSearchParams(queryPart);
                  const queryEntries = Object.fromEntries(queryParams.entries());
                  console.log("Parsed query params:", queryEntries);
                  
                  Object.keys(queryEntries).forEach((key) => {
                    urlParams[key] = queryEntries[key];
                  });
                } catch (e) {
                  console.log("Query parsing error:", e);
                }
              }
            }
            
            console.log("Final parsed params:", urlParams);
          } else {
            console.log("No URL to parse or URL doesn't contain # or ?");
          }
        } catch (urlError) {
          console.log("URL parsing error (continuing with router params):", urlError);
        }
        
        console.log("Combined URL params:", urlParams);
        console.log("Router params:", params);
        console.log("Available param keys:", Object.keys(urlParams));
        
        // Check for different token types from URL fragments or query params
        const access_token = urlParams.access_token as string | undefined;
        const refresh_token = urlParams.refresh_token as string | undefined;
        const code = urlParams.code as string | undefined;
        const token_hash = urlParams.token_hash as string | undefined;
        const error_description = urlParams.error_description as string | undefined;
        const error_code = urlParams.error_code as string | undefined;
        const type = urlParams.type as string | undefined;
        const test = urlParams.test as string | undefined;
        
        console.log("Extracted params:", { access_token: !!access_token, refresh_token: !!refresh_token, code: !!code, token_hash: !!token_hash, test, type });

        // Handle error cases first
        if (error_description || error_code) {
          const errorMsg = error_description || `Error code: ${error_code}`;
          console.log("AuthCallback error:", errorMsg);
          Alert.alert("Verification Error", errorMsg);
          router.replace(`/(auth)/verify-email?error=${encodeURIComponent(errorMsg)}`);
          return;
        }

        // Handle token_hash verification (Supabase email confirmation)
        if (token_hash && type) {
          setStatus("Verifying email confirmation...");
          console.log("Received token_hash for email verification");
          
          try {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash,
              type: type as any,
            });
            
            if (error) {
              console.log("Token hash verification error:", error);
              
              // Handle rate limiting specifically
              if (error.message.includes("rate limit")) {
                console.log("Rate limit hit, checking if user is already signed in");
                setStatus("Checking authentication status...");
                
                // Wait a moment then check session
                await new Promise(resolve => setTimeout(resolve, 1000));
                const { data: session } = await supabase.auth.getSession();
                
                if (session?.session) {
                  console.log("User is already signed in despite rate limit");
                  setStatus("Email verified successfully! Redirecting...");
                  setTimeout(() => {
                    router.replace("/(auth)/verify-email?verified=true");
                  }, 500);
                  return;
                } else {
                  console.log("Rate limit hit and no session found");
                  Alert.alert("Too Many Attempts", "Please wait a moment and try clicking the email link again.");
                  router.replace(`/(auth)/verify-email?error=${encodeURIComponent("Rate limit reached")}`);
                  return;
                }
              }
              
              // For other errors, check if user is actually signed in
              const { data: session } = await supabase.auth.getSession();
              if (session?.session) {
                console.log("Session found despite error - user is actually signed in");
                setStatus("Email verified successfully! Redirecting...");
                setTimeout(() => {
                  router.replace("/(auth)/verify-email?verified=true");
                }, 500);
                return;
              }
              
              // Only show error if no session exists
              console.log("No session found, showing error");
              Alert.alert("Verification Error", error.message);
              router.replace(`/(auth)/verify-email?error=${encodeURIComponent(error.message)}`);
              return;
            } 
            
            if (data?.session) {
              console.log("Session established successfully from token_hash");
              setStatus("Email verified successfully! Redirecting...");
              
              // Small delay to show success message
              setTimeout(() => {
                router.replace("/(auth)/verify-email?verified=true");
              }, 1000);
              return;
            } 
            
            // Check if session exists even without explicit session in response
            const { data: currentSession } = await supabase.auth.getSession();
            if (currentSession?.session) {
              console.log("Session found after verification - success!");
              setStatus("Email verified successfully! Redirecting...");
              setTimeout(() => {
                router.replace("/(auth)/verify-email?verified=true");
              }, 500);
              return;
            }
            
            console.log("No session created from token_hash");
            router.replace("/(auth)/verify-email?error=No session created");
            return;
          } catch (tokenError) {
            console.error("Token hash verification error:", tokenError);
            
            // Handle rate limiting in catch block too
            if (tokenError instanceof Error && tokenError.message.includes("rate limit")) {
              console.log("Rate limit exception caught, checking session after delay");
              setStatus("Too many requests, checking status...");
              
              await new Promise(resolve => setTimeout(resolve, 1000));
              try {
                const { data: session } = await supabase.auth.getSession();
                if (session?.session) {
                  console.log("Session found despite rate limit exception");
                  setStatus("Email verified successfully! Redirecting...");
                  setTimeout(() => {
                    router.replace("/(auth)/verify-email?verified=true");
                  }, 500);
                  return;
                }
              } catch (sessionError) {
                console.log("Could not check session after rate limit:", sessionError);
              }
              
              Alert.alert("Too Many Attempts", "Please wait a moment before trying again.");
              router.replace("/(auth)/verify-email?error=Rate limit reached");
              return;
            }
            
            // For other exceptions, check if user is signed in
            try {
              const { data: session } = await supabase.auth.getSession();
              if (session?.session) {
                console.log("Session found despite exception - user is signed in");
                setStatus("Email verified successfully! Redirecting...");
                setTimeout(() => {
                  router.replace("/(auth)/verify-email?verified=true");
                }, 500);
                return;
              }
            } catch (sessionError) {
              console.log("Could not check session:", sessionError);
            }
            
            router.replace("/(auth)/verify-email?error=Failed to verify email");
            return;
          }
        }
        // Handle direct token response (URL fragments - for other auth flows)
        else if (access_token && refresh_token) {
          setStatus("Processing authentication tokens...");
          console.log("Received direct tokens from email verification");
          
          try {
            // Set the session directly using the tokens
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            
            if (error) {
              console.log("Token processing error:", error);
              Alert.alert("Verification Error", error.message);
              router.replace(`/(auth)/verify-email?error=${encodeURIComponent(error.message)}`);
            } else if (data?.session) {
              console.log("Session established successfully from tokens");
              setStatus("Email verified successfully! Redirecting...");
              
              // Small delay to show success message
              setTimeout(() => {
                router.replace("/(auth)/verify-email?verified=true");
              }, 1000);
            } else {
              console.log("No session created from tokens");
              router.replace("/(auth)/verify-email?error=No session created");
            }
          } catch (tokenError) {
            console.error("Token processing error:", tokenError);
            router.replace("/(auth)/verify-email?error=Failed to process verification tokens");
          }
        }
        // Handle code exchange (traditional OAuth flow)
        else if (code) {
          setStatus("Exchanging verification code...");
          console.log("Exchanging code for session...");
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.log("Exchange error:", error);
            Alert.alert("Verification Error", error.message);
            router.replace(`/(auth)/verify-email?error=${encodeURIComponent(error.message)}`);
          } else if (data?.session) {
            console.log("Session established successfully from code");
            setStatus("Email verified successfully! Redirecting...");
            
            // Small delay to show success message
            setTimeout(() => {
              router.replace("/(auth)/verify-email?verified=true");
            }, 1000);
          } else {
            console.log("No session created from code");
            router.replace("/(auth)/verify-email?error=No session created");
          }
        } else if (test) {
          console.log("Test parameter detected:", test);
          Alert.alert("Deep Link Test", `Deep linking is working! Test parameter: ${test}`);
          router.replace("/(auth)/verify-email?verified=test");
        } else {
          console.log("No verification tokens, token_hash, or code found");
          console.log("Available params:", Object.keys(urlParams));
          Alert.alert("No Verification Data", "No verification tokens, token_hash, or code found in the URL.");
          router.replace("/(auth)/verify-email?error=No verification data found");
        }
      } catch (err) {
        console.error("AuthCallback error:", err);
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