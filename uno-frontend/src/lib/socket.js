import { io } from "socket.io-client";

// For production, use the deployed server URL
// For development, use the current host with port 4001
const serverUrl = import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:4001`
    : undefined);

if (!serverUrl) {
  console.error("VITE_SERVER_URL environment variable is required in production");
}

export const socket = io(serverUrl, {
  transports: ["websocket"],
  reconnection: true,
});


