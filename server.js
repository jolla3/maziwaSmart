// server.js
const http = require('http');
const socketIo = require('socket.io');
const app = require('./app');

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Attach socket.io
const io = socketIo(server, {
  cors: {
    origin: "*", // set to your frontend domain later
    methods: ["GET", "POST"]
  }
});

// Store io inside app (so controllers can use req.app.get('io'))
app.set('io', io);

// Handle connections
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  // Join rooms for farmer or roles
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`📡 Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
