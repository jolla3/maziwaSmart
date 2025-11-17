// models/ListingsAudit.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const listingsAuditSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, index: true },
    userId: { type: Schema.Types.ObjectId, index: true },

    action: { type: String, required: true }, 
    // create, update, delete

    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },

    ip: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

listingsAuditSchema.index({ action: 1 });
listingsAuditSchema.index({ userId: 1, createdAt: -1 })

module.exports = mongoose.model("ListingsAudit", listingsAuditSchema);
