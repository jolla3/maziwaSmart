// utils/emailService.js
const nodemailer = require("nodemailer");

// ✅ Create transporter (Brevo-compatible)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp-relay.brevo.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});


// ✅ Verify connection
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email transporter verification failed:", error.message);
  } else {
    console.log("✅ Brevo email service ready to send messages!");
  }
});

// ✅ Reusable send mail function
const sendMail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: `"MaziwaSmart (No Reply)" <maziwasmart@gmail.com>`,
      to,
      subject,
      replyTo: "maziwasmart@gmail.com",
      headers: {
        "X-Auto-Response-Suppress": "All",
        "Auto-Submitted": "auto-generated",
      },
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("❌ Email sending failed:", err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendMail };
