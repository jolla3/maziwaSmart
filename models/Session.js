// models/Session.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, required: true },
    socketId: { type: String, required: true, unique: true },
    ip: { type: String },
    userAgent: { type: String },
    connectedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Indexes
sessionSchema.index({ userId: 1 });
sessionSchema.index({ socketId: 1 }, { unique: true });
sessionSchema.index({ role: 1 });

module.exports = mongoose.model("Session", sessionSchema);
