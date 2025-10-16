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

import { supabase } from './supabase';

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
    
    // Handle Ghana numbers (starting with 0)
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      return `+233${cleaned.substring(1)}`;
    }
    
    // Add + if missing for international numbers
    if (!cleaned.startsWith('+')) {
      return `+${cleaned}`;
    }
    
    return cleaned;
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
  static async sendVerificationCode(phoneNumber: string, userId: string): Promise<PhoneVerificationResult> {
    try {
      const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
      const config = this.getSupabaseConfig();
      
      const response = await fetch(`${config.supabaseUrl}/functions/v1/send-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.supabaseKey}`,
        },
        body: JSON.stringify({
          phoneNumber: cleanedPhone,
          userId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to send verification code'
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
  static async verifyCode(phoneNumber: string, code: string, userId: string): Promise<PhoneVerificationResult> {
    try {
      const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
      const config = this.getSupabaseConfig();
      
      const response = await fetch(`${config.supabaseUrl}/functions/v1/verify-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.supabaseKey}`,
        },
        body: JSON.stringify({
          phoneNumber: cleanedPhone,
          verificationCode: code,
          userId
        })
      });

      const data = await response.json();

      if (!response.ok) {
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