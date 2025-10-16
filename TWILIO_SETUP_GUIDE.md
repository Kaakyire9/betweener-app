# Twilio Setup Guide for Betweener App

## 🚀 Complete Setup Instructions

### 1. Twilio Account Setup
1. Go to [Twilio Console](https://console.twilio.com/)
2. Create account (get $15.50 free trial credits)
3. Get your credentials:
   - **Account SID**: Found on dashboard (starts with AC...)
   - **Auth Token**: Found on dashboard (keep secret!)
   - **Phone Number**: Buy a number or use trial number

### 2. Create Verify Service (Recommended)
1. Go to Twilio Console > Verify > Services
2. Create new Verify Service
3. Copy the **Service SID** (starts with VA...)
4. Configure settings:
   - Code length: 6 digits
   - Code expiry: 10 minutes
   - Max attempts: 5

### 3. Update Environment Variables
Replace these values in your `.env` file:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Database Setup
Run the SQL in `phone-verification-schema.sql` in your Supabase dashboard:
```sql
-- Creates phone_verifications table and adds phone fields to profiles
```

### 5. Backend Setup Options

#### Option A: Supabase Edge Functions (Recommended)
```bash
# Create edge function
supabase functions new phone-verification

# Deploy function
supabase functions deploy phone-verification
```

#### Option B: Next.js API Routes
- Copy files from `api-examples/` to your Next.js `pages/api/` directory
- Install Twilio: `npm install twilio`

#### Option C: Express.js Backend
```javascript
app.post('/api/send-verification', async (req, res) => {
  // Use code from api-examples/send-verification.js
});
```

### 6. Frontend Integration
Add to your verification flow:
```tsx
import { PhoneVerification } from '@/components/PhoneVerification';

// In your component
<PhoneVerification
  onVerificationComplete={(success, score) => {
    if (success) {
      console.log('Phone verified with score:', score);
      // Update user verification level
    }
  }}
  onCancel={() => setShowPhoneVerification(false)}
/>
```

## 💰 Cost Breakdown

### Free Trial Credits: $15.50
- SMS: $0.0075 per message (2,066 free SMS)
- Voice: $0.013 per minute
- Verify API: $0.05 per verification (310 free verifications)

### Production Pricing:
- **SMS**: ~$0.0075 per message
- **Verify Service**: $0.05 per verification
- **Phone Number**: $1/month

### Example Monthly Costs:
- 1,000 verifications: $50/month
- 500 verifications: $25/month
- 100 verifications: $5/month

## 🔒 Security Best Practices

1. **Never expose credentials in frontend code**
2. **Use backend API for all Twilio calls**
3. **Implement rate limiting** (max 3 attempts per phone per hour)
4. **Validate phone numbers** before sending SMS
5. **Log verification attempts** for fraud detection

## 🧪 Testing

### Test Phone Numbers (Free)
Twilio provides test numbers that work without sending real SMS:
- +15005550006 (valid number, delivers SMS)
- +15005550001 (invalid number)
- +15005550007 (triggers error)

### Demo Mode
Current implementation uses mock responses:
- **Test Code**: "123456" (always works)
- **Any Other Code**: Fails
- Remove mock functions when backend is ready

## 🛠 Troubleshooting

### Common Issues:
1. **"Invalid phone number"**: Ensure proper format (+233...)
2. **"Service not found"**: Check TWILIO_VERIFY_SERVICE_SID
3. **"Auth error"**: Verify Account SID and Auth Token
4. **"Rate limit exceeded"**: Wait or upgrade Twilio plan

### Debug Steps:
1. Check Twilio Console > Logs for detailed errors
2. Verify environment variables are loaded
3. Test with Twilio test phone numbers first
4. Check network connectivity for API calls

## 📱 Ghana-Specific Configuration

### Ghana Mobile Prefixes:
- MTN: +233 24, +233 54, +233 55, +233 59
- Vodafone: +233 20, +233 50
- AirtelTigo: +233 26, +233 27, +233 56, +233 57

### Verification Score Logic:
- Ghana number (+233): +0.3 score
- Mobile number: +0.2 score
- Valid format: +0.1 score
- Base score: 0.5

## 🚀 Next Steps

1. **Set up Twilio account** and get credentials
2. **Run database migration** to add phone verification tables
3. **Deploy backend API** (Supabase Functions recommended)
4. **Update environment variables** with real Twilio credentials
5. **Test with real phone numbers**
6. **Integrate into verification flow**

## 📞 Support
- Twilio Documentation: https://www.twilio.com/docs
- Twilio Support: https://support.twilio.com
- Test your setup: https://www.twilio.com/console/phone-numbers/verified