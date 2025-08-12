// server.js or socket.js
const { getAdminPortersMonthlySummary } = require("../controllers/porterMilkSummaryController.js");

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Admin joins their own room for targeted updates
  socket.on("join_admin_room", (adminId) => {
    socket.join(`admin_${adminId}`);
    console.log(`Admin ${adminId} joined room admin_${adminId}`);
  });

  // Triggered when a milk record is created/updated
  socket.on("milk_record_updated", async (adminId) => {
    await getAdminPortersMonthlySummary(null, null, io, adminId);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});
