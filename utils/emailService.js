const nodemailer = require("nodemailer");

// ✅ Configure Gmail transport using your app password
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // maziwasmart@gmail.com
    pass: process.env.EMAIL_PASS, // xlxo wbhx fmtn qhyk
  },
});

/**
 * Send a general-purpose email (OTP, approval, rejection, etc.)
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 */
exports.sendMail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: `"MaziwaSmart (No Reply)" <no-reply@maziwasmart.com>`,
      replyTo: "no-reply@maziwasmart.com",
      to,
      subject,
      headers: {
        "X-Auto-Response-Suppress": "All",
        "Auto-Submitted": "auto-generated",
      },
      html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to}`);
  } catch (err) {
    console.error("❌ Email sending failed:", err.message);
  }
};
