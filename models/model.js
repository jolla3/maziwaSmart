// ============================
// Universal User Schema (Admin, Porter, Vet, Farmer)
// ============================
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone:{type:Number},
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'porter', 'farmer'],
    required: true
  },


  farmer:[{ type: mongoose.Schema.Types.ObjectId, ref: 'Farmer'}],
  porter:[{ type: mongoose.Schema.Types.ObjectId, ref: 'Porter'}]

  
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// ============================
// Farmer Schema
// ============================
const farmerSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  farmer_code: { type: Number, required: true, unique: true },
  phone: { type: Number },
  location: String,
  password: { type: String},
  email: { type: String  },
   role: {
    type: String,
    enum: [ 'farmer']
  },

  join_date: { type: Date, default: Date.now },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  manager_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Manager' }],


  is_active: { type: Boolean, default: true }
});

const Farmer = mongoose.model('Farmer', farmerSchema);


// ============================
// Manager Schema
// ============================
const managerSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: Number, required: true, unique: true },
  farmer_code: { type: String, required: true },
    email: { type: String, required: true, unique: true }, 


  farmer: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer" }, // backlink
  created_at: { type: Date, default: Date.now },
});

const Manager = mongoose.model('Manager', managerSchema);
// ============================
// Porter Schema
// ============================
const porterSchema = new mongoose.Schema({
  name: { type: String },
  phone: { type: Number },
  assigned_route: { type: String },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  password: { type: String },
 role: {
    type: String,
    enum: [ 'porter']

  },  email: { type: String },

  is_active: { type: Boolean, default:false }
}, { timestamps: true });

const Porter = mongoose.model('Porter', porterSchema);

const porterLogSchema = new mongoose.Schema({
  porter_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Porter',
    required: true
  },
  porter_name: {
    type: String // Optional for quick lookups without population
  },
  activity_type: {
    type: String,
    enum: ['collection', 'delivery', 'check-in', 'check-out', 'other'],
    required: true
  },
  log_date: {
    type: Date,
    default: Date.now
  },
  location: {
    type: String
  },
  litres_collected: {
    type: Number,
    default: 0
  },
  remarks: {
    type: String
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Admin who recorded the log (if applicable)
  }
}, { timestamps: true });

const PorterLog = mongoose.model('PorterLog', porterLogSchema);

module.exports = PorterLog



// ============================
// Milk Record Schema
// ============================

const milkRecordSchema = new mongoose.Schema({
  created_by: {type : mongoose.Schema.Types.ObjectId, ref: 'Porter' },
  farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer' },

  farmer_code: { type: Number, required: true },
  litres: { type: Number, required: true },
collection_date: { type: Date, default: Date.now },
  time_slot: { type: String, enum: ['morning','midmorning', 'afternoon','evening'], required: true },
  created_at: { type: Date, default: Date.now }
})
const MilkRecord = mongoose.model('MilkRecord', milkRecordSchema);


// models/DailyMilkSummary.js
// models/DailyMilkSummary.js


const dailyMilkSummarySchema = new mongoose.Schema({
  porter_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Porter', required: true },
  porter_name: { type: String, required: true },
  summary_date: { type: Date, required: true }, // Date-only
  farmer_code: { type: Number, required: true },
  time_slot: { type: String, enum: ['morning', 'midmorning', 'afternoon'], required: true },
  total_litres: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

// Unique index to prevent duplicates per day/porter/farmer/slot
dailyMilkSummarySchema.index({ summary_date: 1, porter_id: 1, farmer_code: 1, time_slot: 1 }, { unique: true });

const DailyMilkSummary = mongoose.model("DailyMilkSummary",dailyMilkSummarySchema);
// ============================
// Breed Schema
// ============================
const breedSchema = new mongoose.Schema({
  breed_name: { type: String, required: true },
  description: String,
  farmer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true },
  is_active: { type: Boolean, default: true } // Add this line
});


const Breed = mongoose.model('Breed', breedSchema);

// ============================
// Cow Schema (includes calves)
// ============================

const cowSchema = new mongoose.Schema({
  cow_name: { type: String, required: true },
  farmer_code: { type: String, required: true },
  cow_code: { type: Number },
  breed_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Breed' },
  farmer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer' },
  gender: { type: String, enum: ['male', 'female'] },
  birth_date: Date,

  // Stage tracking
  stage: {
    type: String,
    enum: ['calf', 'heifer', 'cow'],
    default: 'cow'
  },
  is_calf: { type: Boolean, default: true }, // Just for quick checks
  from_birth: { type: Boolean, default: false }, // ✅ NEW FIELD

  litres_records: [
    {
      litres: { type: Number, required: true },
      time_slot: { type: String, enum: ['morning', 'midmorning', 'afternoon', 'evening'], required: true },
      date: { type: Date, default: Date.now }
    }
  ],

  mother_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', default: null },
  offspring_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cow' }],
  is_active: { type: Boolean, default: true }
});

const Cow = mongoose.model('Cow', cowSchema);

// ============================
// Insemination Record Schema
// ============================
const inseminationSchema = new mongoose.Schema({
  
  cow_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true },
  farmer_code: { type:Number, required: true },
  insemination_date: { type: Date, required: true },
  inseminator: { type: String },
  bull_breed: { type: String },
  notes: { type: String },
  created_at: { type: Date, default: Date.now }
})
const Insemination = mongoose.model('Insemination', inseminationSchema);

// ============================
// Vet Log Schema
// ============================
const vetLogSchema = new mongoose.Schema({
  cow_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow' },
  date: { type: Date, default: Date.now },
  notes: String,
  treatment_type: String,
  vet_name: String
});

const VetLog = mongoose.model('VetLog', vetLogSchema);

// ============================
// Payment Schema
// ============================
const paymentSchema = new mongoose.Schema({
  farmer_code: { type: String },
  date: { type: Date, default: Date.now },
  amount: { type: Number },
  method: { type: String }
});

const Payment = mongoose.model('Payment', paymentSchema);

// ============================
// Notification Schema
// ============================
const notificationSchema = new mongoose.Schema({
  farmer_code: { type: String },
  message: String,
  sent_at: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

// ============================
// Report Schema
// ============================
const reportSchema = new mongoose.Schema({
  type: { type: String },
  generated_by: { type: String },
  date: { type: Date },
  file_path: { type: String }
});

const Report = mongoose.model('Report', reportSchema);

// ============================
// SMS Log Schema
// ============================
const smsLogSchema = new mongoose.Schema({
  farmer_code: { type: String },
  message: String,
  sent_at: { type: Date, default: Date.now },
  status: { type: String, enum: ['delivered', 'failed', 'queued'], default: 'queued' }
});

const milkAnomalySchema = new mongoose.Schema({
  farmer_code: { type: Number, required: true },
  farmer_id: { type: Number, required: true },

  anomaly_date: { type: Date, required: true },
  anomaly_type: { type: String, enum: ['Increase', 'Decrease'], required: true },
  description: { type: String, required: true },
  resolved: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const MilkAnomaly = mongoose.model('MilkAnomaly', milkAnomalySchema);


const SmsLog = mongoose.model('SmsLog', smsLogSchema);
module.exports = {
  User,
  Farmer,
  Manager,
  Porter,
  PorterLog, 
  Breed,
  Cow,
  MilkRecord,
  DailyMilkSummary,
  Insemination,
  VetLog,
  MilkAnomaly,
  Payment,
  Notification,
  Report,
  SmsLog
};
