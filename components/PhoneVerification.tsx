import { useAuth } from '@/lib/auth-context';
import { PhoneVerificationService } from '@/lib/phone-verification';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface PhoneVerificationProps {
  onVerificationComplete: (success: boolean, score: number) => void;
  onCancel: () => void;
}

export const PhoneVerification: React.FC<PhoneVerificationProps> = ({
  onVerificationComplete,
  onCancel,
}) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSid, setVerificationSid] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneScore, setPhoneScore] = useState(0);

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    setLoading(true);
    try {
      const result = await PhoneVerificationService.sendVerificationCode(phoneNumber, user.id);
      
      if (result.success && result.verificationSid) {
        setVerificationSid(result.verificationSid);
        setPhoneScore(result.confidenceScore || 0);
        setStep('code');
        Alert.alert(
          'Code Sent',
          `A verification code has been sent to ${result.phoneNumber || phoneNumber}${result.phoneNumber?.startsWith('+233') ? ' 🇬🇭' : ''}`
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to send verification code');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    setLoading(true);
    try {
      const result = await PhoneVerificationService.verifyCode(phoneNumber, verificationCode, user.id);
      
      if (result.success && result.verified) {
        Alert.alert('Success', 'Phone number verified successfully!');
        onVerificationComplete(true, result.confidenceScore || phoneScore);
      } else {
        Alert.alert('Error', result.error || 'Invalid verification code');
        setVerificationCode('');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneNumber = (text: string) => {
    // Auto-format phone number as user types
    let cleaned = text.replace(/[^\d+]/g, '');
    
    if (cleaned.startsWith('0')) {
      cleaned = '+233 ' + cleaned.substring(1);
    } else if (cleaned.startsWith('233')) {
      cleaned = '+233 ' + cleaned.substring(3);
    } else if (!cleaned.startsWith('+')) {
      if (cleaned.length > 0) {
        cleaned = '+233 ' + cleaned;
      }
    }
    
    return cleaned;
  };

  const getScoreDisplay = (score: number) => {
    if (score >= 0.8) return { text: 'High Confidence', color: '#4CAF50' };
    if (score >= 0.6) return { text: 'Medium Confidence', color: '#FF9800' };
    return { text: 'Low Confidence', color: '#f44336' };
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Phone Verification</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {step === 'phone' ? (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="phone-portrait" size={48} color="#007AFF" />
            </View>
            
            <Text style={styles.description}>
              Verify your phone number to increase your verification level
            </Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={phoneNumber}
                onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text))}
                placeholder="+233 20 123 4567"
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <Text style={styles.hint}>
                Include country code. Ghana numbers start with +233
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Send Verification Code</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="chatbubble-ellipses" size={48} color="#007AFF" />
            </View>
            
            <Text style={styles.description}>
              Enter the 6-digit code sent to {phoneNumber}
            </Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Verification Code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={verificationCode}
                onChangeText={setVerificationCode}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="sms-otp"
              />
              
              {phoneScore > 0 && (
                <View style={styles.scoreContainer}>
                  <Text style={styles.scoreLabel}>Verification Confidence:</Text>
                  <Text style={[styles.scoreText, { color: getScoreDisplay(phoneScore).color }]}>
                    {getScoreDisplay(phoneScore).text} ({(phoneScore * 100).toFixed(0)}%)
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerifyCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Verify Code</Text>
                  </>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.resendButton}
                onPress={() => setStep('phone')}
                disabled={loading}
              >
                <Text style={styles.resendText}>Change Phone Number</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  iconContainer: {
    marginVertical: 30,
    alignItems: 'center',
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 4,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  scoreContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    padding: 12,
    alignItems: 'center',
  },
  resendText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
});