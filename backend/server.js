// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// room -> array of users: { id, name, avatar }
const roomUsers = {};

io.on("connection", (socket) => {
  console.log("✅ A user connected:", socket.id);

  // ✅ Always listen for chat messages, outside of joinRoom
  socket.on("chatMessage", ({ room, user, text }) => {
    io.to(room).emit("chatMessage", { user, text });
  });

  socket.on("joinRoom", ({ room, username }) => {
    socket.join(room);
    socket.room = room;
    socket.username = username;

    // Random avatar
    const avatar = `https://randomuser.me/api/portraits/${Math.random() > 0.5 ? "men" : "women"}/${Math.floor(Math.random() * 90)}.jpg`;

    const user = {
      id: socket.id,
      name: username,
      avatar
    };

    if (!roomUsers[room]) roomUsers[room] = [];

    if (!roomUsers[room].some(u => u.id === socket.id)) {
      roomUsers[room].push(user);
    }

    io.to(room).emit("userEvent", {
      type: "join",
      user: username,
    });

    io.to(room).emit("userList", roomUsers[room]);
  });

  socket.on("disconnect", () => {
    const { room, username } = socket;
    if (room && username) {
      roomUsers[room] = roomUsers[room]?.filter((u) => u.id !== socket.id);

      io.to(room).emit("userEvent", {
        type: "leave",
        user: username,
      });

      io.to(room).emit("userList", roomUsers[room]);
    }
  });

  socket.on("updateState", ({ room, timeLeft, isRunning, isBreak }) => {
    io.to(room).emit("syncState", { timeLeft, isRunning, isBreak });
    console.log("📤 Broadcasting syncState to room:", room, { timeLeft, isRunning, isBreak });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});

