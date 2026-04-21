import { io } from "socket.io-client";

// For production, use the deployed server URL
// For development, use the current host with port 4001
const serverUrl = import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:4001`
    : "https://unogame.up.railway.app");

if (!serverUrl) {
  console.error("VITE_SERVER_URL environment variable is required in production");
}

export const socket = io(serverUrl, {
  transports: ["polling", "websocket"],
  upgrade: true,
  timeout: 20000,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});


