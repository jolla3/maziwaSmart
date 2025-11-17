// models/MonitoringConfig.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const monitoringConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// REMOVE THIS → it caused the duplicate index warning
// monitoringConfigSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model("MonitoringConfig", monitoringConfigSchema);
