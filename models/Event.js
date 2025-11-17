// models/Event.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const eventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true },
    role: { type: String },

    type: { type: String, required: true }, 
    // Examples:
    // auth.login.success
    // auth.login.fail
    // listing.create
    // listing.update
    // milk.record
    // system.error
    // etc.

    ip: { type: String, index: true },
    userAgent: { type: String },

    metadata: { type: Schema.Types.Mixed },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Indexes
eventSchema.index({ type: 1, createdAt: -1 });
eventSchema.index({ userId: 1, createdAt: -1 });
eventSchema.index({ ip: 1, createdAt: -1 });
eventSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Event", eventSchema);
