// Backend API endpoint for verifying Twilio SMS code
// Place this file in: api/verify-code.js (if using Next.js backend)

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phoneNumber, code } = req.body;

  if (!phoneNumber || !code) {
    return res.status(400).json({ error: 'Phone number and code are required' });
  }

  try {
    // Verify code using Twilio Verify service
    const verificationCheck = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({
        to: phoneNumber,
        code: code
      });

    const isVerified = verificationCheck.status === 'approved';

    res.status(200).json({
      success: true,
      verified: isVerified,
      status: verificationCheck.status
    });

  } catch (error) {
    console.error('Twilio verification error:', error);
    res.status(500).json({
      success: false,
      verified: false,
      errorMessage: error.message || 'Failed to verify code'
    });
  }
}