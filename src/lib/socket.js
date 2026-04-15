import { io } from "socket.io-client";

export const socket = io("https://unogame.up.railway.app", {
  transports: ["websocket"], // 👈 ONLY websocket
  reconnection: true,
});


