const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Notification = require('./models/model').Notification;

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://maziwa-smart.vercel.app", "http://localhost:3000", "http://localhost:3001"],  // <-- ADD your dev URL
    methods: ["GET", "POST", "DELETE", "PATCH", "PUT"],
    credentials: true,
  },
});
// Store sockets by role or farmer_code
io.on('connection', (socket) => {
  console.log('⚡ New client connected:', socket.id);

  // Join room based on farmer_code or role
  socket.on('join', ({ farmer_code, role }) => {
    if (farmer_code) {
      socket.join(`farmer_${farmer_code}`);
      console.log(`👨‍🌾 Farmer ${farmer_code} joined room`);
    }
    if (role) {
      socket.join(role);
      console.log(`🔑 User joined role: ${role}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

app.set('io', io); // 🔑 so controllers can access io
