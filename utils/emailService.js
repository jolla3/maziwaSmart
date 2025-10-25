// utils/emailService.js
const Brevo = require("@getbrevo/brevo");

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

// ✅ Reusable sendMail function
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

module.exports = { sendMail };
