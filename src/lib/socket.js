import { io } from "socket.io-client";

export const socket = io("https://unogame.up.railway.app", {
  transports: ["polling", "websocket"], // 👈 polling FIRST
  reconnection: true,
});