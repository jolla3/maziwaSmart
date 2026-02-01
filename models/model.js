// models/index.js
// ============================
// Master Farm System Schema (merged + hooks + gestation)
// ============================

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const moment = require('moment-timezone');

// ---------------------------
// User Schema (Admin, Broker, Buyer, Vet, Manager)
// ---------------------------
const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: Number },
  password: { type: String },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'broker', 'buyer', 'seller', 'manager'], // ✅ fixed
    required: true
  },
  photo: { type: String },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  is_approved_seller: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// ---------------------------
// Farmer Schema
// ---------------------------
const farmerSchema = new Schema({
  fullname: { type: String, required: true },
  farmer_code: { type: Number, unique: true },
  phone: { type: Number },
  email: { type: String },
  password: { type: String },
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
  phone: { type: Number, unique: true },
  email: { type: String },
  password: { type: String },
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
  breed_name: {
    type: String,
    required: true,
    trim: true
  },

  // CRITICAL: Separate biology from reproductive role
  animal_species: {
    type: String,
    enum: ['cow', 'goat', 'sheep', 'pig'],
    required: true
  },

  male_role: {
    type: String,
    enum: ['bull', 'buck', 'ram', 'boar'],
    required: true
  },

  // Sire profile details
  bull_code: {
    type: String,
    trim: true
  },
  bull_name: {
    type: String,
    trim: true
  },
  origin_farm: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    trim: true
  },
  description: String,

  // Farmer scope
  farmer_id: {
    type: Schema.Types.ObjectId,
    ref: 'Farmer',
    required: true,
    index: true
  },

  is_active: {
    type: Boolean,
    default: true,
    index: true
  },

  // DEPRECATED: Legacy field - DO NOT USE in new code
  // Will be removed in v2.0 after all data is migrated
  species: {
    type: String
  }

}, { timestamps: true });

// ============================================================================
// SCHEMA-LEVEL VALIDATION: Prevent biologically impossible combinations
// ============================================================================

breedSchema.pre('validate', function (next) {
  // Map valid animal_species → male_role combinations
  const validRoles = {
    'cow': 'bull',
    'goat': 'buck',
    'sheep': 'ram',
    'pig': 'boar'
  };

  // If both fields are set, validate they match biology
  if (this.animal_species && this.male_role) {
    const expectedRole = validRoles[this.animal_species];

    if (expectedRole !== this.male_role) {
      return next(new Error(
        `Invalid combination: male_role "${this.male_role}" ` +
        `does not match animal_species "${this.animal_species}". ` +
        `Expected male_role "${expectedRole}".`
      ));
    }
  }

  next();
});

// Indexes for performance
breedSchema.index({ farmer_id: 1, animal_species: 1, is_active: 1 });
breedSchema.index({ farmer_id: 1, breed_name: 1, animal_species: 1 }, { unique: false });

const Breed = mongoose.model('Breed', breedSchema);
// ---------------------------
// Cow (flexible animal) Schema
// NOTE: kept model name 'Cow' to remain backward-compatible with controllers.
// Supports offspring auto-update, milk stats fields.
// ---------------------------


const cowSchema = new Schema({
  // identifiers
  animal_code: { type: String }, // indexed below

  species: {
    type: String,
    enum: ["cow", "goat", "sheep", "pig"], // bull is NOT a species per your enum
    required: true
  },

  cow_name: { type: String, required: true },
  cow_code: { type: Number },

  farmer_code: { type: Number, required: true },
  farmer_id: { type: Schema.Types.ObjectId, ref: "Farmer", required: true },

  // breed
  breed: { type: String, default: '' }, // fallback / display
  breed_id: { type: Schema.Types.ObjectId, ref: "Breed" },

  gender: {
    type: String,
    enum: ["male", "female", "unknown"],
    required: true
  },

  birth_date: { type: Date, required: true },

  age: { type: String, default: "" }, // computed in pre-save

  status: {
    type: String,
    enum: ["active", "pregnant", "for_sale", "sold", "deceased"],
    default: "active"
  },

  stage: {
    type: String,
    enum: [
      // cow
      "calf", "heifer", "cow",
      "bull_calf", "young_bull", "mature_bull",
      // goat
      "kid", "doeling", "buckling", "nanny", "buck",
      // sheep
      "lamb", "ewe", "ram",
      // pig
      "piglet", "gilt", "sow", "boar"
    ],
    default: null
  },

  // lineage
  mother_id: { type: Schema.Types.ObjectId, ref: "Cow", default: null },
  father_id: { type: Schema.Types.ObjectId, ref: "Cow", default: null },

  offspring_ids: [{ type: Schema.Types.ObjectId, ref: "Cow" }],
  total_offspring: { type: Number, default: 0 },

  // external sire info (when no registered father)
  bull_code: { type: String },
  bull_name: { type: String },

  photos: [{ type: String }],
  notes: { type: String },

  speciesDetails: { type: Schema.Types.Mixed },

  // milk
  lifetime_milk: { type: Number, default: 0 },
  daily_average: { type: Number, default: 0 },

  pregnancy: {
    is_pregnant: { type: Boolean, default: false },
    insemination_id: { type: Schema.Types.ObjectId, ref: "Insemination" },
    expected_due_date: { type: Date, default: null }
  }
}, { timestamps: true });

//
// INDEX STRATEGY — ONE PLACE ONLY
//
cowSchema.index({ animal_code: 1 }, { unique: true, sparse: true });
cowSchema.index({ farmer_code: 1, species: 1 });
cowSchema.index({ farmer_code: 1, status: 1 });
cowSchema.index({ farmer_code: 1, stage: 1 });
cowSchema.index({ gender: 1 });
cowSchema.index({ mother_id: 1 });
cowSchema.index({ father_id: 1 });

/**
 * VALIDATION & COMPUTATION
 * Age math here. Strict checks.
 */
cowSchema.pre("save", function (next) {
  if (this.stage) {
    const validStages = {
      cow: ["calf", "heifer", "cow", "bull_calf", "young_bull", "mature_bull"],
      goat: ["kid", "doeling", "buckling", "nanny", "buck"],
      sheep: ["lamb", "ewe", "ram"],
      pig: ["piglet", "gilt", "sow", "boar"]
    };

    if (!validStages[this.species]?.includes(this.stage)) {
      return next(new Error(`Invalid stage '${this.stage}' for species '${this.species}'`));
    }

    // gender-stage match
    const maleStages = ["bull_calf", "young_bull", "mature_bull", "buckling", "buck", "ram", "boar"];
    const femaleStages = ["heifer", "cow", "doeling", "nanny", "ewe", "gilt", "sow"];

    if (maleStages.includes(this.stage) && this.gender !== "male") {
      return next(new Error(`Stage '${this.stage}' requires gender = male`));
    }
    if (femaleStages.includes(this.stage) && this.gender !== "female") {
      return next(new Error(`Stage '${this.stage}' requires gender = female`));
    }
  }

  // compute age
  if (this.birth_date) {
    const today = new Date();
    const birth = new Date(this.birth_date);
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    let days = today.getDate() - birth.getDate();

    if (days < 0) {
      months--;
      days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years} years`);
    if (months > 0) parts.push(`${months} months`);
    if (days > 0) parts.push(`${days} days`);

    this.age = parts.length > 0 ? parts.join(', ') : 'Less than a day';
  } else {
    this.age = "";
  }

  next();
});

/**
 * OFFSPRING LINKING — CREATION & UPDATES
 * Handles changes. No drift.
 */
cowSchema.post("save", async function (doc, next) {
  try {
    const Cow = mongoose.model("Cow");
    const ops = [];

    if (doc.mother_id && doc.isModified('mother_id')) {
      ops.push(
        Cow.findByIdAndUpdate(doc.mother_id, {
          $addToSet: { offspring_ids: doc._id },
          $inc: { total_offspring: 1 }
        })
      );
    }

    if (doc.father_id && doc.isModified('father_id')) {
      ops.push(
        Cow.findByIdAndUpdate(doc.father_id, {
          $addToSet: { offspring_ids: doc._id },
          $inc: { total_offspring: 1 }
        })
      );
    }

    await Promise.all(ops);
  } catch (err) {
    console.error("Cow offspring link error:", err);
  }

  next();
});
const Cow = mongoose.model("Cow", cowSchema)

// --------------------------
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
  cow_code: { type: String },
  animal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true },

  litres: { type: Number, required: true, min: [0.1, 'Litres must be greater than 0'], max: [100, 'Litres exceed realistic maximum'] },
  collection_date: { type: Date, default: () => moment.tz("Africa/Nairobi").toDate() },
  time_slot: {
    type: String,
    enum: [
      "early_morning",
      "morning",
      "midday",
      "afternoon",
      "evening",
      "night"
    ],
    required: true
  },

  update_count: { type: Number, default: 0 },
  created_at: { type: Date, default: () => moment.tz("Africa/Nairobi").toDate() }
});

// Indexes for frequent queries
cowMilkRecordSchema.index({ animal_id: 1, collection_date: -1 });
cowMilkRecordSchema.index({ farmer_code: 1, animal_id: 1 });
cowMilkRecordSchema.index({ animal_id: 1, time_slot: 1 });

// Auto increment update_count
cowMilkRecordSchema.pre('save', function (next) {
  if (!this.isNew) this.update_count += 1;
  next();
});

// 🐄 Helper: Flag animal listings with repeated anomalies
const flagAnimalForListing = async (animalId, session) => {
  const MilkAnomaly = mongoose.model('MilkAnomaly');
  const Listing = mongoose.model('Listing');

  const thirtyDaysAgo = moment.tz("Africa/Nairobi").subtract(30, 'days').startOf('day').toDate();
  const anomalies = await MilkAnomaly.countDocuments({
    animal_id: animalId,
    anomaly_date: { $gte: thirtyDaysAgo }
  }).session(session);

  const flagged = anomalies >= 3; // threshold

  await Listing.findOneAndUpdate(
    { animal_id: animalId },
    { flagged_for_anomaly: flagged, anomaly_count: anomalies },
    { upsert: true, session } // ensure listing exists
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

    // 1️⃣ Update lifetime milk and incremental stats
    const prevTotalLitres = cow.running_total_litres || 0;
    const prevTotalDays = cow.total_milk_days || 0;
    const eatDate = moment(doc.collection_date).tz("Africa/Nairobi").format("YYYY-MM-DD");

    // Check if this is a new day
    const lastMilkDate = cow.last_milk_date ? moment(cow.last_milk_date).tz("Africa/Nairobi").format("YYYY-MM-DD") : null;
    const isNewDay = eatDate !== lastMilkDate;

    const newTotalLitres = prevTotalLitres + doc.litres;
    const newTotalDays = isNewDay ? prevTotalDays + 1 : prevTotalDays;
    const newDailyAverage = newTotalDays > 0 ? newTotalLitres / newTotalDays : 0;

    // Incremental variance (Welford's online algorithm)
    const prevMean = cow.running_mean || 0;
    const prevM2 = cow.running_m2 || 0; // Sum of squared differences

    // Fetch total record count (per animal)
    const recordCount = await CowMilkRecord.countDocuments({ animal_id: doc.animal_id }).session(session) || 1; // Min 1 for first

    const delta = doc.litres - prevMean;
    const newMean = prevMean + delta / recordCount;
    const delta2 = doc.litres - newMean;
    const newM2 = prevM2 + delta * delta2;
    const newVariance = recordCount > 1 ? newM2 / (recordCount - 1) : 0; // Sample variance
    const newStdDev = Math.sqrt(newVariance);

    await Cow.findByIdAndUpdate(doc.animal_id, {
      $inc: { lifetime_milk: doc.litres },
      running_total_litres: newTotalLitres,
      total_milk_days: newTotalDays,
      daily_average: newDailyAverage,
      last_milk_date: doc.collection_date,
      running_mean: newMean,
      running_m2: newM2,
      running_stddev: newStdDev
    }, { session });

    // 3️⃣ Dynamic anomaly detection (using cached stats)
    const mean = newMean; // Use updated
    const stdDev = newStdDev;

    // Fallback for early records or zero stdDev: Use breed norms (stub—customize per species/breed)
    const minExpected = cow.species === 'cow' ? 5 : 1; // Realistic min L/day for dairy cow/goat
    const maxExpected = cow.species === 'cow' ? 50 : 10; // Max sane spike

    let lowThreshold = Math.max(mean - (stdDev * 2), minExpected);
    let highThreshold = Math.min(mean + (stdDev * 2), maxExpected);

    // Seasonal adjustment stub (e.g., dry season lower yields—use farm data later)
    const isDrySeason = moment(doc.collection_date).tz("Africa/Nairobi").month() >= 0 && moment(doc.collection_date).tz("Africa/Nairobi").month() <= 2; // Jan-Mar dry in Kenya
    if (isDrySeason) {
      lowThreshold *= 0.8; // 20% lower expectation
    }

    let anomalyData = null;
    if (doc.litres < lowThreshold) {
      anomalyData = { litres: doc.litres, daily_average: newDailyAverage, anomaly_type: 'low_production', resolved: false, resolved_at: null };
    } else if (doc.litres > highThreshold) {
      anomalyData = { litres: doc.litres, daily_average: newDailyAverage, anomaly_type: 'sudden_spike', resolved: false, resolved_at: null };
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
        message: `⚠️ Anomaly for ${doc.cow_name} (${doc.time_slot}): ${anomalyData.anomaly_type} (${doc.litres}L vs avg ${newDailyAverage.toFixed(2)}L)`,
        sent_at: moment.tz("Africa/Nairobi").toDate(),
        read: false // Add status
      }], { session });
    }

    await flagAnimalForListing(doc.animal_id, session);

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

const inseminationSchema = new Schema({
  cow_id: { type: Schema.Types.ObjectId, ref: 'Cow', required: true },
  farmer_code: { type: Number },
  cow_name: { type: String },
  insemination_date: { type: Date, required: true },
  inseminator: { type: String },
  method: { type: String, enum: ['AI', 'natural', 'other'], default: 'AI' },

  // Bull information - either from profile or manual
  bull_profile_id: { type: Schema.Types.ObjectId, ref: 'Breed', default: null },
  bull_source: { type: String, enum: ['profile', 'manual'], required: true },
  bull_code: { type: String },
  bull_name: { type: String },
  bull_breed: { type: String },

  // Outcome
  outcome: {
    type: String,
    enum: ['pregnant', 'not_pregnant', 'unknown'],
    default: 'unknown'
  },
  expected_due_date: { type: Date, default: null },
  notes: { type: String },
  has_calved: { type: Boolean, default: false },
  calf_id: { type: Schema.Types.ObjectId, ref: 'Cow', default: null },

  // Bookkeeping
  resolved_by: { type: Schema.Types.ObjectId, ref: 'Insemination', default: null },
  resolved_at: { type: Date, default: null },

  created_at: { type: Date, default: Date.now }
});

// ============================================================================
// POST-SAVE HOOK: Handle pregnancy, notifications, and resolution
// ============================================================================

inseminationSchema.post('save', async function (doc, next) {
  try {
    const Cow = mongoose.model('Cow');
    const Insemination = mongoose.model('Insemination');
    const Notification = mongoose.model('Notification');

    const cow = await Cow.findById(doc.cow_id);
    if (!cow) {
      console.log('Insemination: Cow not found, skipping post-save');
      return next();
    }

    // === PREGNANCY CONFIRMED ===
    if (doc.outcome === 'pregnant') {
      const gestationDaysMap = {
        cow: 283,
        goat: 150,
        sheep: 152,
        pig: 114
      };
      const gestationDays = gestationDaysMap[cow.species] || 280;

      // Calculate due date if not provided
      let dueDate = doc.expected_due_date
        ? new Date(doc.expected_due_date)
        : new Date(doc.insemination_date);

      if (!doc.expected_due_date) {
        dueDate.setDate(dueDate.getDate() + gestationDays);
        await Insemination.findByIdAndUpdate(doc._id, {
          $set: { expected_due_date: dueDate }
        });
      }

      // Update cow pregnancy status
      await Cow.findByIdAndUpdate(cow._id, {
        $set: {
          'pregnancy.is_pregnant': true,
          'pregnancy.insemination_id': doc._id,
          'pregnancy.expected_due_date': dueDate,
          status: 'pregnant'
        }
      });

      // === FIXED: Create notification with proper user structure ===
      try {
        await Notification.create({
          user: {
            type: 'farmer',
            id: cow.farmer_id
          },
          farmer_code: cow.farmer_code,
          cow: cow._id,
          notification_type: 'gestation_alert',
          title: `${cow.cow_name || 'Animal'} Confirmed Pregnant`,
          message: `${cow.species} ${cow.cow_name || cow.name || 'animal'} confirmed pregnant. Expected calving: ${dueDate.toDateString()}`,
          status: 'unread'
        });
      } catch (notificationErr) {
        console.error('Notification creation failed (non-blocking):', notificationErr.message);
        // Don't fail the insemination save if notification fails
      }

      // Mark all earlier attempts on same animal as resolved
      await Insemination.updateMany(
        {
          cow_id: cow._id,
          _id: { $ne: doc._id },
          insemination_date: { $lte: doc.insemination_date },
          outcome: { $nin: ['pregnant', 'not_pregnant'] }
        },
        {
          $set: {
            outcome: 'not_pregnant',
            resolved_by: doc._id,
            resolved_at: new Date()
          }
        }
      );
    }
    // === PREGNANCY FAILED ===
    else if (doc.outcome === 'not_pregnant') {
      // Only reset if this was the active pregnancy
      if (cow.pregnancy?.insemination_id?.toString() === doc._id.toString()) {
        await Cow.findByIdAndUpdate(cow._id, {
          $set: {
            'pregnancy.is_pregnant': false,
            'pregnancy.insemination_id': null,
            'pregnancy.expected_due_date': null,
            status: 'active'
          }
        });

        // Notify farmer
        try {
          await Notification.create({
            user: {
              type: 'farmer',
              id: cow.farmer_id
            },
            farmer_code: cow.farmer_code,
            cow: cow._id,
            notification_type: 'pregnancy_failed',
            title: `${cow.cow_name || 'Animal'} Not Pregnant`,
            message: `${cow.species} ${cow.cow_name || cow.name || 'animal'} pregnancy test negative. Available for re-insemination.`,
            status: 'unread'
          });
        } catch (notificationErr) {
          console.error('Notification creation failed (non-blocking):', notificationErr.message);
        }
      }
    }

    next();
  } catch (err) {
    console.error('Insemination post-save error:', err);
    // Don't throw - let the save complete even if hook fails
    next();
  }
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
  user: {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['User', 'Farmer', 'seller', 'superadmin'], required: true }
  },

  farmer_code: { type: Number },

  cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow' }, // optional, only for animal-specific events  
  type: {
    type: String,
    enum: ['gestation_alert', 'calving_reminder', 'milk_anomaly', 'general', 'chat_message'],
    required: true
  },
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
  animal_type: { type: String, required: true },
  animal_id: { type: Schema.Types.ObjectId, ref: "Cow", default: null },
  farmer: { type: Schema.Types.ObjectId, ref: "Farmer", default: null },
  seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
  price: { type: Number, required: true },
  description: { type: String },
  photos: [{ type: String }],
  location: { type: String },
  

  // 🐄 Flexible details for seller-provided animals
  animal_details: {
    age: { type: Number },
    breed_name: { type: String },
    gender: { type: String, enum: ["male", "female"] },
    bull_code: { type: String },
    bull_name: { type: String },
    bull_breed: { type: String },

    // stats
    lifetime_milk: { type: Number, default: 0 },
    daily_average: { type: Number, default: 0 },
    total_offspring: { type: Number, default: 0 },

    // lifecycle
    status: { type: String, enum: ["active", "pregnant", "deceased"], default: "active" },
    stage: {
      type: String,
      enum: [
        // Cows
        'calf', 'heifer', 'cow',
        // Bulls
        'bull_calf', 'young_bull', 'mature_bull',
        // Goats
        'kid', 'doeling', 'buckling', 'nanny', 'buck',
        // Sheep
        'lamb', 'ewe', 'ram',
        // Pigs
        'piglet', 'gilt', 'sow', 'boar'
      ],
      default: null
    },

    // pregnancy info
    pregnancy: {
      is_pregnant: { type: Boolean, default: false },
      expected_due_date: { type: Date, default: null },
      insemination_id: { type: Schema.Types.ObjectId, ref: "Insemination" }
    }
  },

  status: { type: String, enum: ["available", "sold"], default: "available" }
}, { timestamps: true });
const Listing = mongoose.model('Listing', listingSchema);

const viewSchema = new Schema({
  listing_id: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
  viewer_id: { type: Schema.Types.ObjectId, required: true },
  viewer_schema: { type: String, enum: ['Farmer', 'User'], required: true },
  viewer_role: { type: String, required: true },
  viewed_at: { type: Date, default: Date.now }
});
viewSchema.index({ listing_id: 1, viewer_id: 1 }, { unique: true }); // Enforce unique views per user/listing
viewSchema.index({ listing_id: 1 }); // For fast aggregates on summary
viewSchema.index({ viewer_role: 1 }); // Optimize role grouping
const View = mongoose.model('View', viewSchema);

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
  sender: {
    id: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ["User", "Farmer", "Porter"], required: true },
  },
  receiver: {
    id: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ["User", "Farmer", "Porter"], required: true },
  },
  listing: { type: Schema.Types.ObjectId, ref: "Listing", default: null },
  message: { type: String, required: true },

  // 💬 new fields
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
  deliveredAt: { type: Date },

  created_at: { type: Date, default: Date.now },
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);


const sellerApprovalRequestSchema = new Schema({
  seller_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  country: { type: String, required: true },
  county: { type: String, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  created_at: { type: Date, default: Date.now },
});

const SellerApprovalRequest = mongoose.model("SellerApprovalRequest", sellerApprovalRequestSchema);
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

// const ChatMessage = mongoose.model('ChatMess3age', dealSchema);



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
  SellerApprovalRequest,

  DailyMilkSummary,
  Breed,
  Cow,
  Insemination,
  VetLog,
  Payment,
  View,
  Notification,
  Report,
  SmsLog,
  MilkAnomaly,
  Listing,
  Chat,
  ChatRoom,
  ChatMessage
};
