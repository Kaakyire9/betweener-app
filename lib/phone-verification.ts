// Twilio Phone Verification Service - Backend API Version
// Uses Supabase Edge Functions for secure server-side Twilio integration

import { supabase } from './supabase';

// Types for phone verification
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

export interface PhoneVerificationCheck {
  success: boolean;
  verified?: boolean;
  status?: string;
  error?: string;
}

export class PhoneVerificationService {
  
  // Get Supabase URL and anon key
  private static getSupabaseUrl(): string {
    return 'https://jbyblhithbqwojhwlenv.supabase.co';
  }

  private static getSupabaseAnonKey(): string {
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieWJsaGl0aGJxd29qaHdsZW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjczNTIzNzIsImV4cCI6MjA0MjkyODM3Mn0.LdeqWSeLLQIFoHrScg7mqQ_XaorEXMBYGz1_uLyJo0w';
  }

  // Clean and format phone number
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

  // Calculate confidence score based on phone number characteristics
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
  
  // Step 1: Send SMS verification code via backend API
  static async sendVerificationCode(phoneNumber: string, userId: string): Promise<PhoneVerificationResult> {
    try {
      const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
      
      const response = await fetch(`${this.getSupabaseUrl()}/functions/v1/send-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getSupabaseAnonKey()}`,
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
  
  // Step 2: Verify the code entered by user via backend API
  static async verifyCode(phoneNumber: string, code: string, userId: string): Promise<PhoneVerificationResult> {
    try {
      const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
      
      const response = await fetch(`${this.getSupabaseUrl()}/functions/v1/verify-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getSupabaseAnonKey()}`,
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
  
  // Legacy method - use new methods instead
  static async sendVerificationCodeOld(phoneNumber: string): Promise<PhoneVerificationResult> {
    console.warn('Use sendVerificationCode(phoneNumber, userId) instead');
    return { success: false, error: 'Method requires user ID' };
  }
  
  // Store phone verification result in database (for manual tracking if needed)
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
      
      if (error) throw error;
    } catch (error) {
      console.error('Error storing phone verification:', error);
    }
  }
}

// Usage example:
/*
// Send verification code
const result = await PhoneVerificationService.sendVerificationCode('+233201234567');
if (result.success) {
  console.log('SMS sent!', result.verificationSid);
}

// Verify code
const verification = await PhoneVerificationService.verifyCode(result.verificationSid, '123456');
if (verification.verified) {
  console.log('Phone verified!');
}
*/