// models/Alert.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const alertSchema = new Schema(
  {
    type: { type: String, required: true }, 
    // Examples:
    // brute_force
    // spam_listing
    // duplicate_listing
    // suspicious_activity
    // abnormal_price

    severity: { type: String, enum: ["low", "medium", "high"], required: true },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },

    status: { type: String, enum: ["open", "reviewing", "closed"], default: "open" },

    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
  },
  { timestamps: false }
);

alertSchema.index({ type: 1, createdAt: -1 });
alertSchema.index({ severity: 1, status: 1 });
alertSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Alert", alertSchema);