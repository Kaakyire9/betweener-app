// Backend API endpoint for sending Twilio SMS
// Place this file in: api/send-verification.js (if using Next.js backend)
// Or adapt for your backend framework

const twilio = require('twilio');

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    // Send verification SMS using Twilio Verify service
    const verification = await client.verify.v2
      .services(verifyServiceSid)
      .verifications.create({
        to: phoneNumber,
        channel: 'sms'
      });

    res.status(200).json({
      success: true,
      verificationSid: verification.sid,
      status: verification.status
    });

  } catch (error) {
    console.error('Twilio error:', error);
    res.status(500).json({
      success: false,
      errorMessage: error.message || 'Failed to send verification code'
    });
  }
}

// Alternative using raw SMS (without Verify service)
export async function sendRawSMS(phoneNumber, code) {
  try {
    const message = await client.messages.create({
      body: `Your Betweener verification code is: ${code}. Valid for 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    return {
      success: true,
      messageSid: message.sid
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message
    };
  }
}