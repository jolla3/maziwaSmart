// app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();
require('./cron/updateCowStages');

const app = express();

// middleware
app.use(express.json());
app.use(cors());

// all your routes...
const userAuth = require('./routes/authRouter');
app.use('/api/userAuth', userAuth);

const farmerRouter = require('./routes/farmerRouter');
app.use('/api/farmers', farmerRouter);

const porterRouter = require('./routes/porterRouter');
app.use('/api/porters', porterRouter);

const porterMilkRouter = require('./routes/porterMilkRouter');
app.use('/api/milk', porterMilkRouter);

const porterMilkSummaryRouter = require('./routes/portersMilkSummaryRouter');
app.use('/api/summary', porterMilkSummaryRouter);

const createCowRouter = require('./routes/createCowRouter');
app.use('/api/cow', createCowRouter);

const breedRoutes = require('./routes/breedRouter');
app.use('/api/breed', breedRoutes);

const cowSummaryRouter = require('./routes/cowSummaryRouter');
app.use('/api/cows', cowSummaryRouter);

const addCalfRouter = require('./routes/addCalfRouter');
app.use('/api/calf', addCalfRouter);

const inseminationRoutes = require('./routes/inseminationRoutes');
app.use('/api/insemination', inseminationRoutes);

const ocrRoutes = require('./routes/ocrRoutes');
app.use('/api/ocr', ocrRoutes);

const farmManagerRouter = require('./routes/managerRoutes');
app.use('/api/manager', farmManagerRouter);

const adminDashStatsRouter = require('./routes/adminDashStatsRouter');
app.use('/api/admin', adminDashStatsRouter);

const porterDashStatsRouter = require('./routes/porterDashStatsRouter');
app.use('/api/porterstats', porterDashStatsRouter);

const anomaliesRouter = require("./routes/anomaliesRouter");
app.use("/api/recordstats", anomaliesRouter);

const farmerDashboard = require("./routes/FarmerDashboardRouter");
app.use("/api/farmerdash", farmerDashboard);


const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

const AnimalRouter = require('./routes/AnimalRouter')
app.use('/api/animals', AnimalRouter);

const anomalyRoutes = require('./routes/anomalyRoutes');
app.use('/api/anomalies', anomalyRoutes);





// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('connected to MongoDb'))
    .catch(err => console.log("MongoDB connection error", err));

// ✅ Create HTTP server + socket.io here
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*", // set to frontend domain in production
    methods: ["GET", "POST"]
  }
});


// Store io inside app (so controllers can use req.app.get('io'))
app.set('io', io);

// Handle socket connections
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`📡 Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
