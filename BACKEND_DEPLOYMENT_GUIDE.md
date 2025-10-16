# Backend API Deployment Guide

## ⚠️ Security Notice
**NEVER commit real API keys or secrets to your repository!** 
- Always use placeholder values in documentation
- Store real credentials in environment variables or secure vaults
- Use `.env` files locally and add them to `.gitignore`

## Overview
Your backend API has been created using Supabase Edge Functions. This provides a secure, serverless environment for handling phone verification with Twilio.

## Files Created
- `supabase/functions/send-verification/index.ts` - Sends SMS verification codes
- `supabase/functions/verify-phone/index.ts` - Verifies SMS codes  
- `supabase/functions/_shared/cors.ts` - CORS configuration

## Deployment Steps

### 1. Install Supabase CLI
```bash
npm install -g supabase
```

### 2. Login to Supabase
```bash
supabase login
```

### 3. Link Your Project
```bash
supabase link --project-ref jbyblhithbqwojhwlenv
```

### 4. Set Environment Variables
In your Supabase dashboard, go to Settings → Edge Functions → Environment Variables and add:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_VERIFY_SERVICE_SID=your_twilio_verify_service_sid_here
SUPABASE_URL=https://jbyblhithbqwojhwlenv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Important**: Replace the placeholder values above with your actual Twilio credentials from your [Twilio Console](https://console.twilio.com/):
- **Account SID**: Found in your Twilio Console Dashboard
- **Auth Token**: Found in your Twilio Console Dashboard  
- **Verify Service SID**: Create a Verify Service in Twilio Console → Verify → Services

**Note**: Get your Service Role Key from Supabase Dashboard → Settings → API → service_role key

### 5. Deploy Functions
```bash
cd c:\Projects\betweener-app
supabase functions deploy send-verification
supabase functions deploy verify-phone
```

### 6. Test Your Functions
Once deployed, your functions will be available at:
- `https://jbyblhithbqwojhwlenv.supabase.co/functions/v1/send-verification`
- `https://jbyblhithbqwojhwlenv.supabase.co/functions/v1/verify-phone`

## Alternative: Local Development

### 1. Start Supabase Locally
```bash
supabase start
```

### 2. Serve Functions Locally
```bash
supabase functions serve --env-file .env
```

### 3. Test Locally
Your functions will be available at:
- `http://localhost:54321/functions/v1/send-verification`
- `http://localhost:54321/functions/v1/verify-phone`

## Testing the API

### Send Verification Code
```bash
curl -X POST 'https://jbyblhithbqwojhwlenv.supabase.co/functions/v1/send-verification' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "phoneNumber": "+233201234567",
    "userId": "your-user-id"
  }'
```

### Verify Code
```bash
curl -X POST 'https://jbyblhithbqwojhwlenv.supabase.co/functions/v1/verify-phone' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "phoneNumber": "+233201234567",
    "verificationCode": "123456",
    "userId": "your-user-id"
  }'
```

## Security Notes
1. **Never expose Twilio credentials** in your frontend code
2. **Service Role Key** should only be used in Edge Functions, never in client code
3. **Rate limiting** is handled by Twilio's built-in protections
4. **CORS** is configured to allow your app's domain

## Troubleshooting

### Common Issues
1. **"Function not found"** - Ensure functions are deployed correctly
2. **"Authorization failed"** - Check your anon key and bearer token
3. **"Twilio error"** - Verify your Twilio credentials in environment variables
4. **"Database error"** - Ensure your database schema is up to date

### Debugging
1. Check function logs in Supabase Dashboard → Edge Functions → Logs
2. Use `supabase functions logs` to view logs locally
3. Test with curl commands first before testing in app

## Next Steps
1. Deploy functions to production
2. Test with real phone numbers
3. Monitor usage and costs in Twilio Console
4. Set up phone number verification in your app UI

Your backend API is now ready to handle secure phone verification!