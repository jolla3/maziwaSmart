// entry file
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); // Add this
const { Server } = require('socket.io'); // Add this
require('dotenv').config();
require('./cron/updateCowStages');

const app = express();
const server = http.createServer(app); // Create HTTP server
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000", 
        methods: ["GET", "POST"]
    }
});

// middleware
app.use(express.json());
app.use(cors());

// login/register routes
const userAuth = require('./routes/authRouter');
app.use('/api/userAuth', userAuth);

// admin_ add farmers
const farmerRouter = require('./routes/farmerRouter');
app.use('/api/farmers', farmerRouter);

// admin _add porters
const porterRouter = require('./routes/porterRouter');
app.use('/api/porters', porterRouter);

// porter add milk (pass io to this router)
const porterMilkRouter = require('./routes/porterMilkRouter')(io);
app.use('/api/milk', porterMilkRouter);

// get summary
const porterMilkSummaryRouter = require('./routes/portersMilkSummaryRouter');
app.use('/api/summary', porterMilkSummaryRouter);

// cow create
const createCowRouter = require('./routes/createCowRouter');
app.use('/api/cow', createCowRouter);

// create cow breed
const breedRoutes = require('./routes/breedRouter');
app.use('/api/breed', breedRoutes);

// getting the cows records
const cowSummaryRouter = require('./routes/cowSummaryRouter');
app.use('/api/cows', cowSummaryRouter);

// adding a calf to the cow
const addCalfRouter = require('./routes/addCalfRouter');
app.use('/api/calf', addCalfRouter);

// insemination routes
const inseminationRoutes = require('./routes/inseminationRoutes');
app.use('/api/insemination', inseminationRoutes);

// ocr // image scanner
const ocrRoutes = require('./routes/ocrRoutes');
app.use('/api/ocr', ocrRoutes);

// add farm managers
const farmManagerRouter = require('./routes/managerRoutes');
app.use('/api/manager', farmManagerRouter);

// admin dashboard stats
const adminDashStatsRouter = require('./routes/adminDashStatsRouter');
app.use('/api/admin', adminDashStatsRouter);

// porter dashboard stats
const porterDashStatsRouter = require('./routes/porterDashStatsRouter');
app.use('/api/porterstats', porterDashStatsRouter);

const anomaliesRouter = require("./routes/anomaliesRouter");
app.use("/api/recordstats", anomaliesRouter);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('connected to MongoDb'))
    .catch(err => console.log("MongoDB connection error", err));

// Socket.IO connection
io.on("connection", (socket) => {
    console.log("A client connected:", socket.id);
    socket.on("disconnect", () => {
        console.log("A client disconnected:", socket.id);
    });
});

const Port = 5000;
server.listen(Port, () => {
    console.log(`Server is running on port ${Port}`);
});
