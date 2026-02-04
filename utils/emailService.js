// utils/emailService.js
const Brevo = require("@getbrevo/brevo");
require('dotenv').config();

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

const sendMail = async (to, subject, html) => {
  try {
    const emailData = {
      sender: {
        name: "MaziwaSmart (No Reply)",
        email: "maziwasmart@gmail.com", // use Gmail or any verified Brevo sender
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      replyTo: { email: "no-reply@maziwasmart.com" }, // no replies
      headers: {
        "X-Auto-Response-Suppress": "All",
        "Auto-Submitted": "auto-generated",
      },
    };

    const response = await apiInstance.sendTransacEmail(emailData);
    console.log("✅ Email sent successfully via Brevo:", response.messageId || response);
    return { success: true };
  } catch (error) {
    console.error("❌ Email sending failed:", error.message || error);
    return { success: false, error: error.message || error };
  }
};


// NEW: Beautiful Welcome Email
const sendWelcomeEmail = async (email, name, role = "user") => {
  const roleGreeting = {
    farmer: "Welcome to MaziwaSmart Farmer Community!",
    seller: "Welcome to MaziwaSmart Seller Portal!",
    default: "Welcome to MaziwaSmart!"
  };

  const subject = roleGreeting[role] || roleGreeting.default;

  const DASHBOARD_BY_ROLE = {
  farmer: "/fmr.drb",
  seller: "/slr.drb",
  admin: "/admindashboard",
  superadmin: "/spr.dmn",
  porter: "/porterdashboard",
  buyer: "/byr.drb",
  manager: "/man.drb",
};

const dashboardPath = DASHBOARD_BY_ROLE[role] || "/login";


  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
      <h1 style="color: #00bcd4;">Hello ${name.split(' ')[0]},</h1>
      <p style="font-size: 16px; line-height: 1.6;">
        Thank you for joining <strong>MaziwaSmart</strong> – Kenya's smartest livestock marketplace!
      </p>
      <p style="font-size: 16px;">
        Your account has been successfully created as a <strong>${role}</strong>.
      </p>
      
      <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h3>Next Steps:</h3>
        <ul>
          <li>Complete your profile</li>
          <li>Verify your phone number</li>
          <li>Start listing animals or browsing the market</li>
        </ul>
      </div>

      



       <a href="${process.env.FRONTEND_URL}${dashboardPath}">
         style="background: #00bcd4; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
        Go to Dashboard →
      </a>

      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Need help? Reply to this email or contact support@maziwasmart.com
      </p>
      <p style="color: #999; font-size: 12px;">© 2026 MaziwaSmart • All Rights Reserved</p>
    </div>
  `;

  return await sendMail(email, subject, html);
};

module.exports = { sendMail, sendWelcomeEmail };