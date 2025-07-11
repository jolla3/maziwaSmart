// ============================
// Universal User Schema (Admin, Porter, Vet, Farmer)
// ============================
const mongoose = require('mongoose');

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
  code: { type: String, unique: true },   // unique identity code: farmer_code, porter_code, etc.

  farmer:{ type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', default:null},
  porter:{ type: mongoose.Schema.Types.ObjectId, ref: 'Porter',default:null}
 

}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// ============================
// Farmer Schema
// ============================
const farmerSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  farmer_code: { type: String, required: true, unique: true },
  phone: { type: Number },
  location: String,
  join_date: { type: Date, default: Date.now },
  is_active: { type: Boolean, default: true }
});

const Farmer = mongoose.model('Farmer', farmerSchema);


// ============================
// Porter Schema
// ============================
const porterSchema = new mongoose.Schema({
  porter_code: { type: String, required: true, unique: true },
  name: { type: String },
  phone: { type: String },
  assigned_route: { type: String },
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

const Porter = mongoose.model('Porter', porterSchema);


// ============================
// Breed Schema
// ============================
const breedSchema = new mongoose.Schema({
  breed_name: { type: String, required: true, unique: true },
  description: String
});

const Breed = mongoose.model('Breed', breedSchema);

// ============================
// Cow Schema (includes calves)
// ============================
const cowSchema = new mongoose.Schema({
  cow_name: { type: String, required: true },
  farmer_code: { type: String, required: true },
  breed_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Breed' },
  gender: { type: String, enum: ['male', 'female'] },
  birth_date: Date,
  litres_per_day: { type: Number },
  mother_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow' },
  offspring_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cow' }],
  is_active: { type: Boolean, default: true }
});

const Cow = mongoose.model('Cow', cowSchema);

// ============================
// Milk Record Schema
// ============================
const milkRecordSchema = new mongoose.Schema({
  cow_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow' },
  collection_date: { type: Date, default: Date.now },
  time_slot: { type: String, enum: ['morning', 'evening'] },
  litres_collected: { type: Number },
  porter_code: { type: String }
});

const MilkRecord = mongoose.model('MilkRecord', milkRecordSchema);

// ============================
// Insemination Record Schema
// ============================
const inseminationSchema = new mongoose.Schema({
  cow_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow' },
  date: { type: Date },
  method: { type: String },
  vet_name: { type: String },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' }
});

const InseminationRecord = mongoose.model('InseminationRecord', inseminationSchema);

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

const SmsLog = mongoose.model('SmsLog', smsLogSchema);
module.exports = {
  User,
  Farmer,
  Porter, 
  Breed,
  Cow,
  MilkRecord,
  InseminationRecord,
  VetLog,
  Payment,
  Notification,
  Report,
  SmsLog
};
