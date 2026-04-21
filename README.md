# Uno Game

A complete multiplayer Uno card game built with Node.js, Socket.IO, and React.

## Features

- Full Uno rules implementation
- Real-time multiplayer with Socket.IO
- Scoring system with elimination
- Wild cards, Draw 2, Skip, Reverse
- UNO calling and catching
- Wild Draw 4 with challenge system
- Responsive React frontend with animations

## Local Development

### Prerequisites

- Node.js 16+
- npm

### Setup

1. Clone the repository
2. Install server dependencies:
   ```bash
   npm install
   ```
3. Install frontend dependencies:
   ```bash
   cd uno-frontend
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. In another terminal, start the frontend:
   ```bash
   cd uno-frontend
   npm run dev
   ```

The game will be available at http://localhost:5173

## Deployment

### Backend (Server)

Deploy to Railway, Heroku, or any Node.js hosting:

1. The server runs on port 4001 by default, or uses `PORT` environment variable
2. No additional config needed - Railway auto-detects Node.js apps

### Frontend

Deploy to Vercel, Netlify, or GitHub Pages:

1. Build the frontend: `npm run build`
2. Set environment variable `VITE_SERVER_URL` to your deployed server URL
3. Deploy the `dist` folder

For Vercel:
- Connect your GitHub repo
- Vercel will auto-detect and build
- Set `VITE_SERVER_URL` in Vercel dashboard

## How to Play

1. Create a room or join with a room code
2. Set scoring options (optional)
3. Dealer flips the start card
4. Play cards that match color or number
5. Call UNO when you have 1 card left
6. First to empty hand wins the round
7. Continue until someone reaches the target score

## Game Rules

- Standard Uno rules apply
- Wild Draw 4 can be challenged if the player has other playable cards
- UNO must be called before playing the second-to-last card
- Other players can catch you if you forget to call UNO