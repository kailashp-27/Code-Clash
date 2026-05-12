const { io } = require("socket.io-client");

const socket1 = io("http://localhost:5000");
const socket2 = io("http://localhost:5000");

socket1.on("connect", () => {
  console.log("Socket 1 connected:", socket1.id);
  socket1.emit("join_queue", { mode: "ranked" });
});

socket2.on("connect", () => {
  console.log("Socket 2 connected:", socket2.id);
  socket2.emit("join_queue", { mode: "ranked" });
});

socket1.on("match_found", (data) => {
  console.log("Socket 1 match_found:", data);
});

socket2.on("match_found", (data) => {
  console.log("Socket 2 match_found:", data);
  process.exit(0);
});

setTimeout(() => {
  console.log("Timeout! Matchmaking failed.");
  process.exit(1);
}, 5000);
