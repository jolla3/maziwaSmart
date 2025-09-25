// models/index.js
// ============================
// Master Farm System Schema (merged + hooks + gestation)
// ============================

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ---------------------------
// User Schema (Admin, Broker, Buyer, Vet, Manager)
// ---------------------------
const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: Number },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'broker', 'buyer', 'seller', 'manager'],
    required: true
  },
  photo: { type: String }, // profile picture
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },

  // 🚨 new field for external sellers
  is_approved_seller: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// ---------------------------
// Farmer Schema
// ---------------------------
const farmerSchema = new Schema({
  fullname: { type: String, required: true },
  farmer_code: { type: Number, required: true, unique: true },
  phone: { type: Number, required: true },
  email: { type: String },
  password: { type: String, required: true },
  photo: { type: String },

  role: { type: String, enum: ['farmer'], default: 'farmer' },

  location: { type: String },
  join_date: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  manager_ids: [{ type: Schema.Types.ObjectId, ref: 'Manager' }],
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

const Farmer = mongoose.model('Farmer', farmerSchema);

// ---------------------------
// Porter Schema
// ---------------------------
const porterSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: Number, required: true, unique: true },
  email: { type: String },
  password: { type: String, required: true },
  photo: { type: String },
  assigned_route: { type: String },

  role: { type: String, enum: ['porter'], default: 'porter' },

  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: false }
}, { timestamps: true });

const Porter = mongoose.model('Porter', porterSchema);

// ---------------------------
// Super Admin Schema (Ghost)
// ---------------------------
const superAdminSchema = new Schema({
  master_key: { type: String, required: true }, // security key
  users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  farmers: [{ type: Schema.Types.ObjectId, ref: 'Farmer' }],
  porters: [{ type: Schema.Types.ObjectId, ref: 'Porter' }],
  managers: [{ type: Schema.Types.ObjectId, ref: 'Manager' }],
  cows: [{ type: Schema.Types.ObjectId, ref: 'Cow' }],
  breeds: [{ type: Schema.Types.ObjectId, ref: 'Breed' }],
  milk_records: [{ type: Schema.Types.ObjectId, ref: 'MilkRecord' }],
  anomalies: [{ type: Schema.Types.ObjectId, ref: 'MilkAnomaly' }],
  listings: [{ type: Schema.Types.ObjectId, ref: 'Listing' }],
  reports: [{ type: Schema.Types.ObjectId, ref: 'Report' }]
}, { timestamps: true });

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

// ---------------------------
// Manager Schema
// ---------------------------
const managerSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: Number, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  farmer_code: { type: Number, required: true },
  photo: { type: String },

  farmer: { type: Schema.Types.ObjectId, ref: 'Farmer' },
  created_at: { type: Date, default: Date.now }
});

const Manager = mongoose.model('Manager', managerSchema);

// ---------------------------
// Porter Log Schema
// ---------------------------
const porterLogSchema = new Schema({
  porter_id: { type: Schema.Types.ObjectId, ref: 'Porter', required: true },
  porter_name: { type: String },
  activity_type: {
    type: String,
    enum: ['collection', 'delivery', 'check-in', 'check-out', 'other', 'update-collection'],
    required: true
  },
  log_date: { type: Date, default: Date.now },
  location: { type: String },
  litres_collected: { type: Number, default: 0 },
  remarks: { type: String },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const PorterLog = mongoose.model('PorterLog', porterLogSchema);

// ---------------------------
// Breed Schema
// ---------------------------
const breedSchema = new Schema({
  breed_name: { type: String, required: true },         // e.g. Friesian, Large White
  species: { type: String, required: true, enum: ['cow', 'bull', 'goat', 'pig'] },

  // Generic
  description: { type: String },
  farmer_id: { type: Schema.Types.ObjectId, ref: 'Farmer', required: true },
  is_active: { type: Boolean, default: true },

  // Bull-specific fields (only filled when species = bull)
  bull_code: { type: String, unique: true, sparse: true },  // catalog/stud code
  bull_name: { type: String },                             // traceable name
  origin_farm: { type: String },
  country: { type: String }
}, { timestamps: true });

const Breed = mongoose.model('Breed', breedSchema);

// ---------------------------
// Cow (flexible animal) Schema
// NOTE: kept model name 'Cow' to remain backward-compatible with controllers.
// Supports offspring auto-update, milk stats fields.
// ---------------------------
const cowSchema = new Schema({
  // General identification
  animal_code: { type: String }, // e.g., COW-2025-0001
  species: { type: String, enum: ['cow', 'bull', 'goat', 'pig'], required: true },
  cow_name: { type: String }, // optional name/tag
  cow_code: { type: Number }, // numeric code if used
  farmer_code: { type: Number, required: true },
  breed_id: { type: Schema.Types.ObjectId, ref: 'Breed' },
  cow_id: { type: Schema.Types.ObjectId, ref: 'Cow' },
  farmer_id: { type: Schema.Types.ObjectId, ref: 'Farmer' },
  gender: { type: String, enum: ['male', 'female', 'unknown'] },
  birth_date: { type: Date },

  // status / stage
  status: { type: String, enum: ['active', 'pregnant', 'for_sale', 'sold', 'deceased'], default: 'active' },
  stage: { type: String, enum: ['calf', 'heifer', 'cow']  },
  is_calf: { type: Boolean, default: false },
  from_birth: { type: Boolean, default: false },

  // lineage
  mother_id: { type: Schema.Types.ObjectId, ref: 'Cow', default: null },
  father_id: { type: Schema.Types.ObjectId, ref: 'Cow', default: null },
 bull_code: { type: String }, // traceable sire code when known
bull_name: { type: String }, // traceable sire name when known
  offspring_ids: [{ type: Schema.Types.ObjectId, ref: 'Cow' }],
  total_offspring: { type: Number, default: 0 },

  // photos & notes
  photos: [{ type: String }],
  notes: { type: String },
  speciesDetails: { type: Schema.Types.Mixed },

  // milk stats
  lifetime_milk: { type: Number, default: 0 },
  daily_average: { type: Number, default: 0 },

  // pregnancy meta (updated by insemination logic)
  pregnancy: {
    is_pregnant: { type: Boolean, default: false },
    insemination_id: { type: Schema.Types.ObjectId, ref: 'Insemination' },
    expected_due_date: { type: Date, default: null }
  },

  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

// indexes
cowSchema.index({ animal_code: 1 });
cowSchema.index({ species: 1, farmer_id: 1 });
cowSchema.index({ farmer_code: 1 });

// Offspring auto-update: when a new cow/animal is saved with mother_id/father_id,
// we push the new child's id into parent's offspring_ids and increment total_offspring.
cowSchema.post('save', async function (doc, next) {
  try {
    const Cow = mongoose.model('Cow');
    if (doc.mother_id) {
      await Cow.findByIdAndUpdate(doc.mother_id, {
        $addToSet: { offspring_ids: doc._id },
        $inc: { total_offspring: 1 }
      }).exec();
    }
    if (doc.father_id) {
      await Cow.findByIdAndUpdate(doc.father_id, {
        $addToSet: { offspring_ids: doc._id },
        $inc: { total_offspring: 1 }
      }).exec();
    }
  } catch (err) {
    console.error('Cow post-save parent update error:', err);
  }
  next();
});

const Cow = mongoose.model('Cow', cowSchema);

// ---------------------------
// Milk Record Schema
// ---------------------------
const milkRecordSchema = new mongoose.Schema({
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Porter' }, // who logged it
  farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer' },
  farmer_code: { type: Number, required: true },
  litres: { type: Number, required: true },
  collection_date: { type: Date, default: Date.now },
  time_slot: { type: String, enum: ['morning', 'midmorning', 'afternoon', 'evening'], required: true },
  update_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

const MilkRecord = mongoose.model('MilkRecord', milkRecordSchema);

// ---------------------------
// 🐄 Farmer-side cow milk record
// ---------------------------
const cowMilkRecordSchema = new mongoose.Schema({
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer' },
  farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true },
  farmer_code: { type: Number, required: true },

  cow_name: { type: String, required: true },
  cow_code: { type: String, required: true },
  animal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true },

  litres: { type: Number, required: true },
  collection_date: { type: Date, default: Date.now },
  time_slot: {
    type: String,
    enum: ['morning', 'midmorning', 'afternoon', 'evening'],
    required: true
  },

  update_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

// Auto increment update_count
cowMilkRecordSchema.pre('save', function (next) {
  if (!this.isNew) this.update_count += 1;
  next();
});

// 🐄 Helper: Flag animal listings with repeated anomalies
const flagAnimalForListing = async (animalId) => {
  const MilkAnomaly = mongoose.model('MilkAnomaly');
  const Listing = mongoose.model('Listing');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const anomalies = await MilkAnomaly.countDocuments({
    animal_id: animalId,
    anomaly_date: { $gte: thirtyDaysAgo }
  });

  const flagged = anomalies >= 3; // threshold

  await Listing.findOneAndUpdate(
    { animal_id: animalId },
    { flagged_for_anomaly: flagged, anomaly_count: anomalies },
    { upsert: true } // ensure listing exists
  );
};

// 📌 Post-save hook: update stats, detect anomalies, notify farmer, flag animal
cowMilkRecordSchema.post('save', async function (doc, next) {
  if (!doc.animal_id) return next();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const Cow = mongoose.model('Cow');
    const CowMilkRecord = mongoose.model('CowMilkRecord');
    const MilkAnomaly = mongoose.model('MilkAnomaly');
    const Notification = mongoose.model('Notification');

    const cow = await Cow.findById(doc.animal_id).session(session);
    if (!cow) { await session.abortTransaction(); return next(); }

    // 🐂🐐 Only cows and goats produce milk
    if (!['cow', 'goat'].includes(cow.species)) {
      await session.commitTransaction();
      session.endSession();
      return next();
    }

    // 1️⃣ Update lifetime milk
    await Cow.findByIdAndUpdate(doc.animal_id, { $inc: { lifetime_milk: doc.litres } }, { session });

    // 2️⃣ Compute daily average
    const agg = await CowMilkRecord.aggregate([
      { $match: { animal_id: doc.animal_id } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$collection_date" } }, daily_total: { $sum: "$litres" } } },
      { $group: { _id: null, totalLitres: { $sum: "$daily_total" }, numDays: { $sum: 1 } } }
    ]).session(session);

    const dailyAverage = (agg[0] && agg[0].numDays > 0)
      ? agg[0].totalLitres / agg[0].numDays
      : 0;

    await Cow.findByIdAndUpdate(doc.animal_id, { daily_average: dailyAverage }, { session });

    // 3️⃣ Dynamic anomaly detection
    const records = await CowMilkRecord.find({ animal_id: doc.animal_id }).select('litres').lean();
    const values = records.map(r => r.litres);
    const mean = values.reduce((a, b) => a + b, 0) / values.length || 0;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length || 1);
    const stdDev = Math.sqrt(variance);

    const lowThreshold = mean - (stdDev * 2);
    const highThreshold = mean + (stdDev * 2);

    let anomalyData = null;
    if (mean > 0 && doc.litres < lowThreshold) {
      anomalyData = { litres: doc.litres, daily_average: dailyAverage, anomaly_type: 'low_production', resolved: false, resolved_at: null };
    } else if (mean > 0 && doc.litres > highThreshold) {
      anomalyData = { litres: doc.litres, daily_average: dailyAverage, anomaly_type: 'sudden_spike', resolved: false, resolved_at: null };
    }

    if (anomalyData) {
      await MilkAnomaly.findOneAndUpdate(
        { animal_id: doc.animal_id, anomaly_date: doc.collection_date },
        { $push: { [`anomaly_slots.${doc.time_slot}`]: anomalyData } }, // 🔑 append, don’t overwrite
        { upsert: true, new: true, session }
      );

      await Notification.create([{
        farmer_code: doc.farmer_code,
        cow: doc.animal_id,
        type: 'milk_anomaly',
        message: `⚠️ Anomaly for ${doc.cow_name} (${doc.time_slot}): ${anomalyData.anomaly_type} (${doc.litres}L vs avg ${dailyAverage.toFixed(2)}L)`,
        sent_at: new Date()
      }], { session });
    }

    await flagAnimalForListing(doc.animal_id);

    await session.commitTransaction();
    session.endSession();
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('CowMilkRecord post-save transaction error:', err);
  }

  next();
});

const CowMilkRecord = mongoose.model('CowMilkRecord', cowMilkRecordSchema);

// ---------------------------
// Daily Milk Summary Schema
// ---------------------------
const dailyMilkSummarySchema = new Schema({
  porter_id: { type: Schema.Types.ObjectId, ref: 'Porter', required: true },
  porter_name: { type: String, required: true },
  summary_date: { type: Date, required: true },
  farmer_code: { type: Number, required: true },
  time_slot: { type: String, enum: ['morning', 'midmorning', 'afternoon', 'evening'], required: true },
  total_litres: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});
dailyMilkSummarySchema.index({ summary_date: 1, porter_id: 1, farmer_code: 1, time_slot: 1 }, { unique: true });

const DailyMilkSummary = mongoose.model('DailyMilkSummary', dailyMilkSummarySchema);

// ---------------------------
// Insemination Schema (with gestation handling)
// - When outcome === 'pregnant' we calculate expected_due_date (insemination_date + 283 days)
// - We set cow.pregnancy.is_pregnant = true and link insemination id
// - Delivery (actual calf creation) should be triggered later (manual or scheduled) when dueDate reached
// ---------------------------
// Insemination schema (schema-level pregnancy handling + notifications)
const inseminationSchema = new Schema({
  cow_id: { type: Schema.Types.ObjectId, ref: 'Cow', required: true },
  farmer_code: { type: Number },
  cow_name: { type: String },
  insemination_date: { type: Date, required: true },
  inseminator: { type: String },
  method: { type: String, enum: ['AI', 'natural', 'other'], default: 'AI' },
  bull_code: { type: String },
  bull_name: { type: String },
  bull_breed: { type: String },
  outcome: { type: String, enum: ['pregnant', 'not_pregnant', 'unknown'], default: 'unknown' },
  expected_due_date: { type: Date, default: null },
  notes: { type: String },
  has_calved: { type: Boolean, default: false },
  calf_id: { type: Schema.Types.ObjectId, ref: 'Cow', default: null },

  // bookkeeping when this attempt resolves other attempts
  resolved_by: { type: Schema.Types.ObjectId, ref: 'Insemination', default: null },
  resolved_at: { type: Date, default: null },

  created_at: { type: Date, default: Date.now }
});

// Post-save hook: handle pregnancy onset, immediate notification, and mark earlier attempts resolved
inseminationSchema.post('save', async function (doc, next) {
  try {
    const Cow = mongoose.model('Cow');
    const Insemination = mongoose.model('Insemination');
    const Notification = mongoose.model('Notification');

    const cow = await Cow.findById(doc.cow_id);
    if (!cow) return next();

    // Only act on explicit outcomes
    if (doc.outcome === 'pregnant') {
      // species-aware gestation map
      const gestationDaysMap = { cow: 283, goat: 150, sheep: 152, pig: 114 };
      const gestationDays = gestationDaysMap[cow.species] || 283;

      // ensure an expected_due_date in the record
      let dueDate = doc.expected_due_date ? new Date(doc.expected_due_date) : new Date(doc.insemination_date);
      if (!doc.expected_due_date) {
        dueDate.setDate(dueDate.getDate() + gestationDays);
        await Insemination.findByIdAndUpdate(doc._id, { $set: { expected_due_date: dueDate } }).exec();
      }

      // update cow pregnancy pointer (only when this attempt succeeded)
      await Cow.findByIdAndUpdate(cow._id, {
        $set: {
          'pregnancy.is_pregnant': true,
          'pregnancy.insemination_id': doc._id,
          'pregnancy.expected_due_date': dueDate,
          status: 'pregnant'
        }
      }).exec();

      // immediate notification to farmer (onset)
      await Notification.create({
        farmer_code: cow.farmer_code,
        cow: cow._id,
        type: 'gestation_alert',
        message: `${cow.species} ${cow.cow_name || cow.name || 'animal'} confirmed pregnant. Expected due: ${dueDate.toDateString()}`,
        sent_at: new Date()
      });

      // mark earlier attempts (<= this attempt date) as not_pregnant/resolved
      await Insemination.updateMany(
        {
          cow_id: cow._id,
          _id: { $ne: doc._id },
          insemination_date: { $lte: doc.insemination_date },
          outcome: { $ne: 'pregnant' }
        },
        { $set: { outcome: 'not_pregnant', resolved_by: doc._id, resolved_at: new Date() } }
      ).exec();

    } else if (doc.outcome === 'not_pregnant') {
      // if the cow was pointing to this attempt as pregnant and now it's marked not_pregnant,
      // clear the cow pregnancy pointer (safety)
      if (cow.pregnancy && cow.pregnancy.insemination_id && cow.pregnancy.insemination_id.toString() === doc._id.toString()) {
        await Cow.findByIdAndUpdate(cow._id, {
          $set: {
            'pregnancy.is_pregnant': false,
            'pregnancy.insemination_id': null,
            'pregnancy.expected_due_date': null,
            status: 'active'
          }
        }).exec();
      }
    }

    // NOTE: we intentionally do NOT insert bull/breed here — that remains controller responsibility.
  } catch (err) {
    console.error('Insemination post-save error:', err);
  }
  next();
});

const Insemination = mongoose.model('Insemination', inseminationSchema);
// ---------------------------
// Vet Log Schema
// ---------------------------
const vetLogSchema = new Schema({
  cow_id: { type: Schema.Types.ObjectId, ref: 'Cow' },
  date: { type: Date, default: Date.now },
  notes: { type: String },
  treatment_type: { type: String },
  vet_name: { type: String }
});
const VetLog = mongoose.model('VetLog', vetLogSchema);

// ---------------------------
// Payment Schema
// ---------------------------
const paymentSchema = new Schema({
  farmer_code: { type: Number },
  date: { type: Date, default: Date.now },
  amount: { type: Number },
  method: { type: String }
});
const Payment = mongoose.model('Payment', paymentSchema);

// ---------------------------
// Notification Schema
// ---------------------------
const notificationSchema = new mongoose.Schema({
  farmer_code: { type: Number, required: true },
  cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true },
  type: { type: String, enum: ['gestation_alert', 'calving_reminder', 'milk_anomaly', 'general'], required: true },
  message: { type: String, required: true },
  is_read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

// ---------------------------
// Report Schema
// ---------------------------
const reportSchema = new Schema({
  type: { type: String },
  generated_by: { type: String },
  date: { type: Date },
  file_path: { type: String }
});
const Report = mongoose.model('Report', reportSchema);

// ---------------------------
// SMS Log Schema
// ---------------------------
const smsLogSchema = new Schema({
  farmer_code: { type: Number },
  message: { type: String },
  sent_at: { type: Date, default: Date.now },
  status: { type: String, enum: ['delivered', 'failed', 'queued'], default: 'queued' }
});
const SmsLog = mongoose.model('SmsLog', smsLogSchema);


// ---------------------------
// 🛑 Milk Anomaly Schema
// ---------------------------
const milkAnomalySchema = new mongoose.Schema({
  farmer_code: { type: Number, required: true },
  animal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true },
  anomaly_date: { type: Date, required: true },
  anomaly_slots: {
    type: Map, // key: time slot ('morning', 'midmorning', etc.)
    of: new Schema({
      litres: { type: Number, required: true },
      daily_average: { type: Number, required: true },
      anomaly_type: { type: String, enum: ['low_production', 'sudden_spike'], required: true },
      resolved: { type: Boolean, default: false }
    }, { _id: false })
  },
  created_at: { type: Date, default: Date.now }
});

const MilkAnomaly = mongoose.model('MilkAnomaly', milkAnomalySchema);


// ---------------------------
// Listing Schema (Marketplace)
// ---------------------------
const listingSchema = new Schema({
  title: { type: String, required: true },
  animal_type: { type: String, enum: ['cow','bull','goat','sheep','pig','chicken'], required: true },
  animal_id: { type: Schema.Types.ObjectId, ref: 'Cow' }, // null if non-farmer
    farmer: { type: Schema.Types.ObjectId, ref: 'Farmer', required: true },

  seller: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // ✅ farmer OR seller
  price: { type: Number, required: true },
  description: String,
  photos: [String],
  location: String,
  status: { type: String, enum: ['available','reserved','sold'], default: 'available' },
  flagged_for_anomaly: { type: Boolean, default: false },
  anomaly_count: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

const Listing = mongoose.model('Listing', listingSchema);


const chatSchema = new Schema({
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }], // buyer + seller
  listing: { type: Schema.Types.ObjectId, ref: 'Listing' },
  messages: [{
    sender: { type: Schema.Types.ObjectId, ref: 'User' },
    text: String,
    sent_at: { type: Date, default: Date.now }
  }],
  created_at: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

// models/chatModel.js
 
const chatRoomSchema = new mongoose.Schema({
  participants: [
    { type: mongoose.Schema.Types.ObjectId, ref: "User" } // buyer + seller
  ],
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing" }, // optional link
  created_at: { type: Date, default: Date.now }
});
const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema);


// ---------------------------
// ChatMessage Schema
// ---------------------------


const chatMessageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true }, // 👈 link to listing
  message: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

// const dealSchema = new Schema({
//   listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
//   buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
//   seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
//   price_agreed: { type: Number, required: true },
//   status: {
//     type: String,
//     enum: ['pending', 'confirmed', 'completed', 'cancelled'],
//     default: 'pending'
//   },
//   created_at: { type: Date, default: Date.now },
//   updated_at: { type: Date, default: Date.now }
// });

// const ChatMessage = mongoose.model('ChatMessage', dealSchema);



// ---------------------------
// Exports
// ---------------------------
module.exports = {
  User,
  Farmer,
  Porter,
  Manager,
  SuperAdmin,
  PorterLog,
  MilkRecord,
  CowMilkRecord,

  DailyMilkSummary,
  Breed,
  Cow,
  Insemination,
  VetLog,
  Payment,
  Notification,
  Report,
  SmsLog,
  MilkAnomaly,
  Listing,
  Chat,
  ChatRoom,
   ChatMessage
};
