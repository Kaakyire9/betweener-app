/**
 * Phone Verification Service
 * 
 * Secure phone number verification using Supabase Edge Functions and Twilio.
 * All Twilio credentials are safely stored in backend environment variables.
 * 
 * Features:
 * - SMS verification code sending
 * - Code verification with confidence scoring
 * - Ghana phone number optimization
 * - Automatic phone number formatting
 * - Database integration for verification tracking
 */

// Important: use a single import path for the Supabase client to avoid bundlers (Metro)
// creating multiple module instances (which can lead to missing sessions in some files).
import { supabase } from '@/lib/supabase';

/**
 * Result interface for phone verification operations
 */
export interface PhoneVerificationResult {
  success: boolean;
  verificationSid?: string;
  phoneNumber?: string;
  confidenceScore?: number;
  carrierInfo?: any;
  verified?: boolean;
  error?: string;
  message?: string;
}

/**
 * Result interface for code verification checks
 */
export interface PhoneVerificationCheck {
  success: boolean;
  verified?: boolean;
  status?: string;
  error?: string;
}

/**
 * Phone Verification Service
 * 
 * Handles secure phone verification through Supabase Edge Functions.
 * Uses environment variables for all sensitive configuration.
 */
export class PhoneVerificationService {
  // Keep a small in-memory cache to avoid transient getSession() timing issues on mobile.
  private static accessTokenCache: { token: string | null; fetchedAt: number } = {
    token: null,
    fetchedAt: 0,
  };

  private static looksLikeJwt(token: string) {
    // Access tokens are JWTs (3 base64url segments).
    const parts = token.split(".");
    return parts.length === 3 && parts[0].length > 0 && parts[1].length > 0;
  }

  private static normalizeAccessToken(token: string | null | undefined) {
    if (!token) return null;
    return this.looksLikeJwt(token) ? token : null;
  }

  private static async getAccessTokenFast(timeoutMs: number = 5000): Promise<string | null> {
    // Always prefer a real access token; never "invent" one by using the anon key as bearer.
    // When this returns null, callers may still call functions anonymously (verify_jwt=false)
    // but the backend will not be able to bind the verification row to a user_id.
    try {
      const cached = this.accessTokenCache;
      if (cached.token && Date.now() - cached.fetchedAt < 30_000) {
        return cached.token;
      }

      const { data } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), timeoutMs)
        ),
      ]);

      const token = data?.session?.access_token ?? null;
      const normalized = this.normalizeAccessToken(token);
      this.accessTokenCache = { token: normalized, fetchedAt: Date.now() };
      return normalized;
    } catch {
      return this.accessTokenCache.token;
    }
  }

  private static async getAccessTokenWithRetry(totalWaitMs: number = 8000): Promise<string | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < totalWaitMs) {
      const token = await this.getAccessTokenFast(2500);
      if (token) return token;
      await new Promise((r) => setTimeout(r, 250));
    }
    return this.accessTokenCache.token;
  }

  private static safeJsonParse(raw: string) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  
  /**
   * Get Supabase configuration from environment variables
   */
  private static getSupabaseConfig() {
    // Get configuration from environment or use defaults for development
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration not found. Please check your environment variables.');
    }
    
    return { supabaseUrl, supabaseKey };
  }

  /**
   * Clean and format phone number to international format
   * Optimized for Ghana phone numbers but handles international numbers
   * 
   * @param phoneNumber - Raw phone number input
   * @returns Formatted international phone number
   */
  static cleanPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');

    // Ghana: if the UI already prepended +233 but the user included a local trunk "0"
    // (e.g. +233024xxxxxxx), remove the 0 to form a valid E.164 (+23324xxxxxxx).
    if (cleaned.startsWith('2330') && cleaned.length >= 12) {
      return `+233${cleaned.substring(4)}`;
    }

    // Handle Ghana numbers (starting with 0)
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      return `+233${cleaned.substring(1)}`;
    }
    
    // Add + for international numbers (we intentionally strip '+' above)
    return `+${cleaned}`;
  }

  /**
   * Calculate confidence score based on phone number characteristics
   * Higher scores indicate more reliable phone numbers
   * 
   * @param phoneNumber - Formatted phone number
   * @returns Confidence score (0-100)
   */
  static calculatePhoneScore(phoneNumber: string): number {
    let score = 0;
    
    // Ghana mobile prefixes (higher confidence)
    const ghanaMobilePrefixes = ['20', '23', '24', '26', '27', '28', '50', '54', '55', '56', '57', '59'];
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.startsWith('233')) {
      const prefix = cleanNumber.substring(3, 5);
      if (ghanaMobilePrefixes.includes(prefix)) {
        score += 40; // High confidence for Ghana mobile
      } else {
        score += 25; // Medium confidence for Ghana landline
      }
    } else {
      score += 15; // Lower confidence for international numbers
    }
    
    // Length validation
    if (cleanNumber.length >= 10 && cleanNumber.length <= 15) {
      score += 20;
    }
    
    // Format validation (basic)
    if (phoneNumber.includes('+')) {
      score += 10;
    }
    
    return Math.min(score, 100);
  }
  
  /**
   * Send SMS verification code via Supabase Edge Function
   * 
   * @param phoneNumber - Phone number to verify
   * @param userId - User ID for tracking
   * @returns Promise with verification result
   */
  static async sendVerificationCode(
    phoneNumber: string,
    userId?: string | null,
    signupSessionId?: string | null,
    accessTokenOverride?: string | null
  ): Promise<PhoneVerificationResult> {
    try {
      const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
      const config = this.getSupabaseConfig();

      // Use the user's access token when available; fall back to anon key for anonymous flows.
      let accessToken = this.normalizeAccessToken(accessTokenOverride) ?? (await this.getAccessTokenFast());
      // If the caller is authenticated (userId present), require a real JWT so the backend can bind user_id.
      if (userId && !accessToken) {
        accessToken = await this.getAccessTokenWithRetry();
      }
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[phone] send-verification auth", {
          hasAccessToken: !!accessToken,
          hasUserId: !!userId,
          hasSignupSessionId: !!signupSessionId,
        });
      }
      if (userId && !accessToken) {
        return {
          success: false,
          error: "Session not ready yet. Please wait a moment and try again.",
        };
      }
      
      const response = await fetch(`${config.supabaseUrl}/functions/v1/send-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Supabase gateway expects Authorization + apikey. If not authenticated, use anon key.
          'Authorization': `Bearer ${accessToken ?? config.supabaseKey}`,
          'apikey': config.supabaseKey,
        },
        body: JSON.stringify({
          phoneNumber: cleanedPhone,
          userId: userId ?? null,
          signupSessionId: signupSessionId ?? null
        })
      });

      const raw = await response.text();
      const data = this.safeJsonParse(raw) ?? {};
      if (!response.ok) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[phone] send-verification failed', { status: response.status, body: raw });
        }
        let errorMessage = data.error || 'Failed to send verification code';
        const twilioMessage = String(data.twilioError || '').toLowerCase();
        const twilioCode = String(data.twilioCode || '').toLowerCase();

        // More helpful messaging for common Twilio failures.
        if (
          twilioMessage.includes('permission to send') ||
          twilioMessage.includes('geo') ||
          twilioMessage.includes('region') ||
          twilioCode.includes('21408')
        ) {
          errorMessage =
            'SMS to this country is currently blocked on our provider. Please try again later or contact support.';
        }
        if (
          twilioMessage.includes('invalid') ||
          twilioMessage.includes('not a valid') ||
          twilioMessage.includes('unverified') ||
          twilioCode.includes('60200') ||
          twilioCode.includes('20404')
        ) {
          errorMessage = 'That phone number looks invalid. Please check the country code and number.';
        }
        return {
          success: false,
          error: errorMessage
        };
      }
      
      return {
        success: true,
        verificationSid: data.verificationSid,
        phoneNumber: data.phoneNumber,
        confidenceScore: data.confidenceScore,
        carrierInfo: data.carrierInfo,
        message: 'Verification code sent successfully'
      };
    } catch (error) {
      console.error('Error sending verification code:', error);
      return {
        success: false,
        error: 'Failed to send verification code. Please check your connection and try again.'
      };
    }
  }
  
  /**
   * Verify the SMS code entered by user
   * 
   * @param phoneNumber - Phone number being verified
   * @param code - Verification code from SMS
   * @param userId - User ID for tracking
   * @returns Promise with verification result
   */
  static async verifyCode(
    phoneNumber: string,
    code: string,
    userId?: string | null,
    signupSessionId?: string | null,
    accessTokenOverride?: string | null
  ): Promise<PhoneVerificationResult> {
    try {
      const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
      const config = this.getSupabaseConfig();

      // Use the user's access token when available; fall back to anon key for anonymous flows.
      let accessToken = this.normalizeAccessToken(accessTokenOverride) ?? (await this.getAccessTokenFast());
      // If the caller is authenticated (userId present), require a real JWT so the backend can bind user_id.
      if (userId && !accessToken) {
        accessToken = await this.getAccessTokenWithRetry();
      }
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[phone] verify-phone auth", {
          hasAccessToken: !!accessToken,
          hasUserId: !!userId,
          hasSignupSessionId: !!signupSessionId,
        });
      }
      if (userId && !accessToken) {
        return {
          success: false,
          error: "Session not ready yet. Please wait a moment and try again.",
        };
      }
      
      const response = await fetch(`${config.supabaseUrl}/functions/v1/verify-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Supabase gateway expects Authorization + apikey. If not authenticated, use anon key.
          'Authorization': `Bearer ${accessToken ?? config.supabaseKey}`,
          'apikey': config.supabaseKey,
        },
        body: JSON.stringify({
          phoneNumber: cleanedPhone,
          verificationCode: code,
          userId: userId ?? null,
          signupSessionId: signupSessionId ?? null
        })
      });

      const raw = await response.text();
      const data = this.safeJsonParse(raw) ?? {};
      if (!response.ok) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[phone] verify-phone failed', { status: response.status, body: raw });
        }
        return {
          success: false,
          error: data.error || 'Failed to verify code'
        };
      }
      
      if (data.verified) {
        return {
          success: true,
          phoneNumber: cleanedPhone,
          verified: true,
          confidenceScore: data.confidenceScore,
          message: 'Phone number verified successfully'
        };
      } else {
        return {
          success: false,
          error: 'Invalid verification code. Please try again.'
        };
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      return {
        success: false,
        error: 'Failed to verify code. Please check your connection and try again.'
      };
    }
  }
  
  /**
   * Store phone verification result in database for tracking
   * 
   * @param userId - User ID
   * @param phoneNumber - Verified phone number
   * @param verificationResult - Result from verification process
   * @param isVerified - Whether verification was successful
   */
  static async storePhoneVerification(
    userId: string, 
    phoneNumber: string, 
    verificationResult: PhoneVerificationResult,
    isVerified: boolean
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('phone_verifications')
        .insert({
          user_id: userId,
          phone_number: phoneNumber,
          confidence_score: verificationResult.confidenceScore || 50,
          status: isVerified ? 'verified' : 'pending',
          verified_at: isVerified ? new Date().toISOString() : null,
        });
      
      if (error) {
        console.error('Database error storing phone verification:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error storing phone verification:', error);
      // Don't throw here to avoid breaking the verification flow
    }
  }

  /**
   * Check if a phone number is already verified for any user
   * 
   * @param phoneNumber - Phone number to check
   * @returns Promise with verification status
   */
  static async isPhoneNumberVerified(phoneNumber: string): Promise<boolean> {
    try {
      const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
      
      const { data, error } = await supabase
        .from('phone_verifications')
        .select('verified_at')
        .eq('phone_number', cleanedPhone)
        .eq('status', 'verified')
        .limit(1);
      
      if (error) {
        console.error('Error checking phone verification status:', error);
        return false;
      }
      
      return data && data.length > 0;
    } catch (error) {
      console.error('Error checking phone verification:', error);
      return false;
    }
  }
}

/**
 * Usage Examples:
 * 
 * // Send verification code
 * const result = await PhoneVerificationService.sendVerificationCode('+233201234567', 'user-123');
 * if (result.success) {
 *   console.log('SMS sent!', result.message);
 * }
 * 
 * // Verify code
 * const verification = await PhoneVerificationService.verifyCode('+233201234567', '123456', 'user-123');
 * if (verification.verified) {
 *   console.log('Phone verified successfully!');
 *   
 *   // Optionally store in database
 *   await PhoneVerificationService.storePhoneVerification('user-123', '+233201234567', verification, true);
 * }
 * 
 * // Check if phone is already verified
 * const isVerified = await PhoneVerificationService.isPhoneNumberVerified('+233201234567');
 * if (isVerified) {
 *   console.log('Phone number is already verified');
 * }
 */
