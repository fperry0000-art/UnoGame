import { io } from "socket.io-client";

const serverUrl =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:4001`
    : "https://unogame.up.railway.app");

export const socket = io(serverUrl, {
  transports: ["polling", "websocket"],
  upgrade: true,
  timeout: 20000,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
