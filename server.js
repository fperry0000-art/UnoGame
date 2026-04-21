import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const SOCKET_PING_INTERVAL_MS = Number(process.env.SOCKET_PING_INTERVAL_MS) || 25000;
const SOCKET_PING_TIMEOUT_MS = Number(process.env.SOCKET_PING_TIMEOUT_MS) || 60000;

const app = express();
app.use(cors());

app.get("/", (_req, res) => {
  res.send("UNO server is running");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["polling", "websocket"],
  pingInterval: SOCKET_PING_INTERVAL_MS,
  pingTimeout: SOCKET_PING_TIMEOUT_MS,
});

const rooms = {};

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createDeck() {
  const colors = ["red", "yellow", "green", "blue"];
  const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse", "+2"];

  let id = 1;
  const deck = [];

  colors.forEach((color) => {
    values.forEach((label, index) => {
      const count = index === 0 ? 1 : 2;
      for (let i = 0; i < count; i += 1) {
        deck.push({ id: id++, color, label });
      }
    });
  });

  for (let i = 0; i < 4; i += 1) {
    deck.push({ id: id++, color: "wild", label: "Wild" });
    deck.push({ id: id++, color: "wild", label: "Wild +4" });
  }

  return shuffle(deck);
}


function cardPoints(card) {
  if (["Skip", "Reverse", "+2"].includes(card.label)) return 20;
  if (["Wild", "Wild +4"].includes(card.label)) return 50;
  if (!Number.isNaN(Number(card.label))) return Number(card.label);
  return 0;
}
function getPlayerName(room, playerId) {
  return room.players.find((p) => p.id === playerId)?.name || "Player";
}

function getActivePlayerIds(game) {
  return game.turnPlayerIds || [];
}

function getCurrentPlayerId(game) {
  return getActivePlayerIds(game)[game.turnIndex] || null;
}

function getNextIndex(game, steps = 1) {
  const ids = getActivePlayerIds(game);
  if (!ids.length) return 0;
  return (game.turnIndex + game.direction * steps + ids.length * 20) % ids.length;
}

function getNextPlayerId(game, steps = 1) {
  const ids = getActivePlayerIds(game);
  if (!ids.length) return null;
  return ids[getNextIndex(game, steps)] || null;
}

function advanceTurn(game, steps = 1) {
  game.turnIndex = getNextIndex(game, steps);
}

function getTopCard(game) {
  return game.discardPile[game.discardPile.length - 1] || null;
}

function getActiveColor(game) {
  const topCard = getTopCard(game);
  if (!topCard) return null;
  return topCard.color === "wild" ? game.chosenColor : topCard.color;
}

function isPlayable(card, topCard, chosenColor) {
  const activeColor = topCard.color === "wild" ? chosenColor : topCard.color;
  return (
    card.color === "wild" ||
    card.color === activeColor ||
    card.label === topCard.label
  );
}

function drawCards(game, playerId, count) {
  if (!game.hands[playerId]) return;
  for (let i = 0; i < count; i += 1) {
    if (!game.drawPile.length) break;
    game.hands[playerId].push(game.drawPile.pop());
  }
}

function clearUnoWindow(game) {
  game.unoWindowOpen = false;
  game.unoPendingPlayerId = null;
}

function clearTurnFlags(game) {
  game.unoSafePlayerId = null;
  game.pendingDrawPlayerId = null;
  game.pendingDrawCardId = null;
  game.pendingWildDrawFour = null;
}

function clearHandFlags(game) {
  clearTurnFlags(game);
  clearUnoWindow(game);
}

function buildActiveIds(room) {
  return room.players
    .map((p) => p.id)
    .filter((id) => !room.game.eliminatedPlayerIds.includes(id));
}

function chooseInitialDealer(room) {
  const activeIds = room.players.map((p) => p.id);
  return activeIds[Math.floor(Math.random() * activeIds.length)];
}

function chooseNextDealer(room) {
  const activeIds = buildActiveIds(room);
  if (!activeIds.length) return null;

  const currentDealerId = room.game.dealerPlayerId;
  const roomOrder = room.players.map((p) => p.id);
  const currentIndex = roomOrder.indexOf(currentDealerId);

  if (currentIndex === -1) return activeIds[0];

  for (let step = 1; step <= roomOrder.length; step += 1) {
    const nextId = roomOrder[(currentIndex + step) % roomOrder.length];
    if (activeIds.includes(nextId)) return nextId;
  }

  return activeIds[0];
}

function setupHand(room, keepDealer = true) {
  const game = room.game;
  const activeIds = buildActiveIds(room);

  if (activeIds.length < 2) {
    game.gameOver = true;
    game.winnerId = activeIds[0] || null;
    game.handWinnerId = null;
    game.statusMessage = activeIds[0]
      ? `${getPlayerName(room, activeIds[0])} won the game`
      : "Game over";
    return;
  }

  if (!keepDealer || !game.dealerPlayerId || !activeIds.includes(game.dealerPlayerId)) {
    game.dealerPlayerId = chooseNextDealer(room);
  }

  const deck = createDeck();
  const hands = {};

  activeIds.forEach((id) => {
    hands[id] = [];
    for (let i = 0; i < 7; i += 1) {
      hands[id].push(deck.pop());
    }
  });

  game.hands = hands;
  game.drawPile = deck;
  game.discardPile = [];
  game.turnPlayerIds = activeIds;
  game.turnIndex = game.turnPlayerIds.indexOf(game.dealerPlayerId);
  game.direction = 1;
  game.chosenColor = null;
  game.handWinnerId = null;
  game.waitingForDealerFlip = true;
  game.startCard = null;
  game.statusMessage = `${getPlayerName(room, game.dealerPlayerId)} is dealer. Flip the start card.`;
  clearHandFlags(game);
}

function initializeGame(room, settings = {}) {
  const scoringEnabled = Boolean(settings.scoringEnabled);
  const targetScore = Math.max(10, Number(settings.targetScore) || 200);

  const scores = {};
  room.players.forEach((p) => {
    scores[p.id] = 0;
  });

  room.game = {
    scores,
    scoringEnabled,
    targetScore,
    eliminatedPlayerIds: [],
    hands: {},
    drawPile: [],
    discardPile: [],
    turnPlayerIds: [],
    turnIndex: 0,
    direction: 1,
    chosenColor: null,
    handWinnerId: null,
    winnerId: null,
    gameOver: false,
    statusMessage: "Game started",
    unoSafePlayerId: null,
    unoWindowOpen: false,
    unoPendingPlayerId: null,
    pendingDrawPlayerId: null,
    pendingDrawCardId: null,
    pendingWildDrawFour: null,
    dealerPlayerId: chooseInitialDealer(room),
    waitingForDealerFlip: true,
    startCard: null,
  };

  setupHand(room, true);
}

function applyScoringAndElimination(room, winnerId) {
  const game = room.game;
  if (!game.scoringEnabled) return;

  const activeIds = buildActiveIds(room);

  console.log("SCORING WINNER:", {
    winnerId,
    winnerName: getPlayerName(room, winnerId),
  });

  activeIds.forEach((playerId) => {
    const hand = game.hands[playerId] || [];
    const penalty = hand.reduce((sum, card) => sum + cardPoints(card), 0);

    console.log("SCORE DEBUG", {
      player: getPlayerName(room, playerId),
      winner: playerId === winnerId,
      cards: hand.map((c) => ({
        color: c.color,
        label: c.label,
        points: cardPoints(c),
      })),
      total: penalty,
      oldScore: game.scores[playerId] || 0,
    });

    if (playerId === winnerId) return;

    game.scores[playerId] = (game.scores[playerId] || 0) + penalty;

    console.log("NEW SCORE", {
      player: getPlayerName(room, playerId),
      newScore: game.scores[playerId],
    });
  });

  activeIds.forEach((playerId) => {
    if (
      (game.scores[playerId] || 0) >= game.targetScore &&
      !game.eliminatedPlayerIds.includes(playerId)
    ) {
      game.eliminatedPlayerIds.push(playerId);
      console.log("PLAYER ELIMINATED", {
        player: getPlayerName(room, playerId),
        score: game.scores[playerId],
      });
    }
  });
}

function finishHand(room, winnerId) {
  const game = room.game;

  clearHandFlags(game);
  game.handWinnerId = winnerId;

  applyScoringAndElimination(room, winnerId);

  if (game.gameOver) {
    return;
  }

  game.statusMessage = `${getPlayerName(room, winnerId)} won the hand`;
}

function ensureUnoWindowClosedForNextAction(game, actorId) {
  if (!game.unoWindowOpen) return;
  if (actorId !== game.unoPendingPlayerId) {
    clearUnoWindow(game);
  }
}

function applyActionCard(room, playedCard, currentPlayerIndex) {
  const game = room.game;
  const playerCount = getActivePlayerIds(game).length;
  const isTwoPlayer = playerCount === 2;

  if (playedCard.label === "Skip") {
    if (isTwoPlayer) {
      game.turnIndex = currentPlayerIndex;
    } else {
      advanceTurn(game, 2);
    }
    return;
  }

  if (playedCard.label === "Reverse") {
    game.direction *= -1;
    if (isTwoPlayer) {
      game.turnIndex = currentPlayerIndex;
    } else {
      advanceTurn(game, 1);
    }
    return;
  }

  if (playedCard.label === "+2") {
    const nextPlayerId = getNextPlayerId(game, 1);
    if (nextPlayerId) drawCards(game, nextPlayerId, 2);

    if (isTwoPlayer) {
      game.turnIndex = currentPlayerIndex;
    } else {
      advanceTurn(game, 2);
    }
    return;
  }

  if (playedCard.label === "Wild +4") {
    const nextPlayerId = getNextPlayerId(game, 1);
    if (!nextPlayerId) {
      advanceTurn(game, 1);
      return;
    }

    const currentPlayerId = getCurrentPlayerId(game);
    const activeColorBeforePlay = getActiveColor({
      ...game,
      discardPile: game.discardPile.slice(0, -1),
    });

    const illegal = (game.hands[currentPlayerId] || []).some(
      (c) => c.color === activeColorBeforePlay
    );

    game.pendingWildDrawFour = {
      playerId: currentPlayerId,
      challengerId: nextPlayerId,
      illegal,
    };

    advanceTurn(game, 1);
    game.statusMessage = `${getPlayerName(room, nextPlayerId)} may challenge the Wild Draw 4`;
    return;
  }

  advanceTurn(game, 1);
}

function applyOpeningCard(room) {
  const game = room.game;
  const card = game.startCard;
  const ids = game.turnPlayerIds;
  const dealerIndex = ids.indexOf(game.dealerPlayerId);

  game.discardPile = [card];
  game.chosenColor = card.color;
  game.waitingForDealerFlip = false;

  game.direction = 1;
  game.turnIndex = (dealerIndex + 1) % ids.length;

  if (card.label === "Skip") {
    game.turnIndex = (dealerIndex + 2) % ids.length;
    game.statusMessage = "Opening card was Skip";
    return;
  }

  if (card.label === "+2") {
    const firstPlayerId = ids[(dealerIndex + 1) % ids.length];
    drawCards(game, firstPlayerId, 2);
    game.turnIndex = (dealerIndex + 2) % ids.length;
    game.statusMessage = "Opening card was Draw 2";
    return;
  }

  if (card.label === "Reverse") {
    game.direction = -1;
    game.turnIndex = (dealerIndex - 1 + ids.length) % ids.length;
    game.statusMessage = "Opening card was Reverse";
    return;
  }

  game.statusMessage = "Hand started";
}

function publicGameState(room) {
  const game = room.game;
  if (!game) return null;

  return {
    ...game,
    activeColor: getActiveColor(game),
  };
}

function emitRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  io.to(roomCode).emit("room_update", {
    roomCode,
    players: room.players,
  });

  if (room.game) {
    io.to(roomCode).emit("game_state", publicGameState(room));
  }
}

function removePlayerFromRooms(socketId) {
  Object.keys(rooms).forEach((roomCode) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.players = room.players.filter((player) => player.id !== socketId);

    if (room.players.length === 0) {
      delete rooms[roomCode];
      return;
    }

    if (room.host === socketId) {
      room.host = room.players[0]?.id || null;
    }

    if (room.game) {
      delete room.game.hands[socketId];
      delete room.game.scores[socketId];
      room.game.eliminatedPlayerIds = room.game.eliminatedPlayerIds.filter((id) => id !== socketId);
      room.game.turnPlayerIds = room.game.turnPlayerIds.filter((id) => id !== socketId);

      if (room.game.turnIndex >= room.game.turnPlayerIds.length) {
        room.game.turnIndex = 0;
      }

      if (room.game.turnPlayerIds.length < 2 && !room.game.gameOver) {
        room.game.gameOver = true;
        room.game.winnerId = room.game.turnPlayerIds[0] || null;
      }

      room.game.statusMessage = "A player left the room";
    }

    emitRoom(roomCode);
  });
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.conn.on("upgrade", () => {
    console.log("Transport upgraded:", socket.id, socket.conn.transport.name);
  });

  socket.conn.on("error", (error) => {
    console.error("Socket transport error:", socket.id, error?.message || error);
  });

  socket.on("create_room", ({ name }) => {
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      socket.emit("room_error", { message: "Name is required" });
      return;
    }

    const roomCode = Math.random().toString(36).slice(2, 7).toUpperCase();

    rooms[roomCode] = {
      host: socket.id,
      players: [{ id: socket.id, name: cleanName }],
      game: null,
    };

    socket.join(roomCode);
    emitRoom(roomCode);
    socket.emit("room_joined", {
      roomCode,
      players: rooms[roomCode].players,
    });
  });

  socket.on("join_room", ({ roomCode, name }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const cleanName = String(name || "").trim();

    if (!cleanName) {
      socket.emit("room_error", { message: "Name is required" });
      return;
    }

    const room = rooms[cleanCode];
    if (!room) {
      socket.emit("room_error", { message: "Room not found" });
      return;
    }

    const alreadyInRoom = room.players.some((player) => player.id === socket.id);
    if (!alreadyInRoom) {
      room.players.push({ id: socket.id, name: cleanName });
    }

    socket.join(cleanCode);
    socket.emit("room_joined", {
      roomCode: cleanCode,
      players: room.players,
    });
    emitRoom(cleanCode);
  });

  socket.on("start_game", ({ roomCode, scoringEnabled, targetScore }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room) {
      socket.emit("room_error", { message: "Room not found" });
      return;
    }

    if (room.players.length < 2) {
      socket.emit("room_error", { message: "At least 2 players are needed to start" });
      return;
    }

    initializeGame(room, { scoringEnabled, targetScore });
    emitRoom(cleanCode);
  });

  socket.on("flip_start_card", ({ roomCode }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room || !room.game) return;

    const game = room.game;
    if (!game.waitingForDealerFlip) {
      socket.emit("room_error", { message: "Start card already flipped" });
      return;
    }

    let card = game.drawPile.pop();
    while (card && card.color === "wild") {
      game.drawPile.unshift(card);
      game.drawPile = shuffle(game.drawPile);
      card = game.drawPile.pop();
    }

    game.startCard = card;
    applyOpeningCard(room);
    emitRoom(cleanCode);
  });

  socket.on("next_hand", ({ roomCode }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room || !room.game) return;

    if (room.game.gameOver) {
      socket.emit("room_error", { message: "The game is already over" });
      return;
    }

    if (!room.game.handWinnerId) {
      socket.emit("room_error", { message: "The current hand is not finished" });
      return;
    }

    room.game.dealerPlayerId = chooseNextDealer(room);
    setupHand(room, true);
    emitRoom(cleanCode);
  });

  socket.on("call_uno", ({ roomCode }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room || !room.game) return;

    const game = room.game;
    const currentPlayerId = getCurrentPlayerId(game);
    const hand = game.hands[socket.id] || [];

    ensureUnoWindowClosedForNextAction(game, socket.id);

    if (currentPlayerId !== socket.id) {
      socket.emit("room_error", { message: "Only the current player can call UNO" });
      return;
    }

    if (hand.length !== 2) {
      socket.emit("room_error", { message: "You can only call UNO when you have 2 cards before playing to 1" });
      return;
    }

    game.unoSafePlayerId = socket.id;
    game.statusMessage = `${getPlayerName(room, socket.id)} CALLED UNO!`;
    emitRoom(cleanCode);
  });

  socket.on("catch_uno", ({ roomCode }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room || !room.game) return;

    const game = room.game;

    if (!game.unoWindowOpen || !game.unoPendingPlayerId) {
      socket.emit("room_error", { message: "Too late to call UNO" });
      return;
    }

    if (socket.id === game.unoPendingPlayerId) {
      socket.emit("room_error", { message: "You cannot call yourself out" });
      return;
    }

    drawCards(game, game.unoPendingPlayerId, 2);
    game.statusMessage = `${getPlayerName(room, socket.id)} caught ${getPlayerName(room, game.unoPendingPlayerId)} not calling UNO`;
    clearUnoWindow(game);
    emitRoom(cleanCode);
  });

  socket.on("draw_card", ({ roomCode }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room || !room.game) return;

    const game = room.game;
    const currentPlayerId = getCurrentPlayerId(game);

    ensureUnoWindowClosedForNextAction(game, socket.id);

    if (game.waitingForDealerFlip) {
      socket.emit("room_error", { message: "Dealer must flip the start card first" });
      return;
    }

    if (currentPlayerId !== socket.id) return;
    if (game.pendingDrawPlayerId === socket.id) return;
    if (game.pendingWildDrawFour) {
      socket.emit("room_error", { message: "Resolve the Wild Draw 4 first" });
      return;
    }
    if (!game.drawPile.length) return;

    const drawnCard = game.drawPile.pop();
    game.hands[socket.id].push(drawnCard);

    const topCard = getTopCard(game);
    const canPlayDrawn = topCard ? isPlayable(drawnCard, topCard, game.chosenColor) : false;

    if (canPlayDrawn) {
      game.pendingDrawPlayerId = socket.id;
      game.pendingDrawCardId = drawnCard.id;
      game.statusMessage = `${getPlayerName(room, socket.id)} drew a playable card`;
    } else {
      clearTurnFlags(game);
      game.statusMessage = `${getPlayerName(room, socket.id)} drew and passed`;
      advanceTurn(game, 1);
    }

    emitRoom(cleanCode);
  });

  socket.on("pass_drawn_card", ({ roomCode }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room || !room.game) return;

    const game = room.game;

    ensureUnoWindowClosedForNextAction(game, socket.id);

    if (game.pendingDrawPlayerId !== socket.id) {
      socket.emit("room_error", { message: "You do not have a drawn card waiting" });
      return;
    }

    clearTurnFlags(game);
    game.statusMessage = `${getPlayerName(room, socket.id)} passed`;
    advanceTurn(game, 1);
    emitRoom(cleanCode);
  });

  socket.on("accept_wild_draw_4", ({ roomCode }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room || !room.game) return;

    const game = room.game;
    ensureUnoWindowClosedForNextAction(game, socket.id);

    if (!game.pendingWildDrawFour || game.pendingWildDrawFour.challengerId !== socket.id) {
      socket.emit("room_error", { message: "No Wild Draw 4 is waiting on you" });
      return;
    }

    drawCards(game, socket.id, 4);
    clearTurnFlags(game);
    game.statusMessage = `${getPlayerName(room, socket.id)} drew 4`;
    advanceTurn(game, 1);
    emitRoom(cleanCode);
  });

  socket.on("challenge_wild_draw_4", ({ roomCode }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room || !room.game) return;

    const game = room.game;
    ensureUnoWindowClosedForNextAction(game, socket.id);

    if (!game.pendingWildDrawFour || game.pendingWildDrawFour.challengerId !== socket.id) {
      socket.emit("room_error", { message: "No Wild Draw 4 is waiting on you" });
      return;
    }

    const { playerId, illegal } = game.pendingWildDrawFour;

    if (illegal) {
      drawCards(game, playerId, 4);
      game.statusMessage = `${getPlayerName(room, socket.id)} won the +4 challenge`;
      clearTurnFlags(game);
    } else {
      drawCards(game, socket.id, 6);
      game.statusMessage = `${getPlayerName(room, socket.id)} lost the +4 challenge and drew 6`;
      clearTurnFlags(game);
      advanceTurn(game, 1);
    }

    emitRoom(cleanCode);
  });

  socket.on("play_card", ({ roomCode, card, chosenColor }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const room = rooms[cleanCode];
    if (!room || !room.game) return;

    const game = room.game;
    const currentPlayerId = getCurrentPlayerId(game);
    const currentPlayerIndex = game.turnIndex;

    ensureUnoWindowClosedForNextAction(game, socket.id);

    if (game.waitingForDealerFlip) {
      socket.emit("room_error", { message: "Dealer must flip the start card first" });
      return;
    }

    if (currentPlayerId !== socket.id) return;
    if (game.pendingWildDrawFour) {
      socket.emit("room_error", { message: "Resolve the Wild Draw 4 first" });
      return;
    }

    const hand = game.hands[socket.id] || [];
    const handCard = hand.find((c) => c.id === card.id);
    if (!handCard) return;

    if (game.pendingDrawPlayerId === socket.id && game.pendingDrawCardId !== card.id) {
      socket.emit("room_error", { message: "After drawing, you may only play the card you just drew" });
      return;
    }

    const topCard = getTopCard(game);
    if (!topCard) return;

    if (!isPlayable(handCard, topCard, game.chosenColor)) {
      socket.emit("room_error", { message: "That card cannot be played right now" });
      return;
    }

    if (handCard.color === "wild" && !["red", "yellow", "green", "blue"].includes(chosenColor)) {
      socket.emit("room_error", { message: "Choose a color for the wild card" });
      return;
    }

    const activeColorBeforePlay = getActiveColor(game);

    game.hands[socket.id] = hand.filter((c) => c.id !== handCard.id);
    game.discardPile.push(handCard);
    game.chosenColor = handCard.color === "wild" ? chosenColor : handCard.color;

    const cardsLeft = game.hands[socket.id].length;
    const playerName = getPlayerName(room, socket.id);

    if (cardsLeft === 1) {
      game.unoWindowOpen = true;
      game.unoPendingPlayerId = socket.id;

      if (game.unoSafePlayerId === socket.id) {
        game.statusMessage = `${playerName} is down to 1 card`;
      } else {
        game.statusMessage = `${playerName} is at 1 card`;
      }
    } else {
      clearUnoWindow(game);
      game.statusMessage = `${playerName} played ${handCard.label}`;
    }

    if (cardsLeft === 0) {
      finishHand(room, socket.id);
      emitRoom(cleanCode);
      return;
    }

    if (handCard.label === "Wild +4") {
      const illegal = (hand || []).some(
        (c) => c.id !== handCard.id && c.color === activeColorBeforePlay
      );

      const nextPlayerId = getNextPlayerId(game, 1);
      game.pendingWildDrawFour = {
        playerId: socket.id,
        challengerId: nextPlayerId,
        illegal,
      };
    }

    game.unoSafePlayerId = null;
    game.pendingDrawPlayerId = null;
    game.pendingDrawCardId = null;

    applyActionCard(room, handCard, currentPlayerIndex);
    emitRoom(cleanCode);
  });

  socket.on("disconnect", (reason) => {
    console.log("Disconnected:", socket.id, reason);
    removePlayerFromRooms(socket.id);
  });
});

const PORT = process.env.PORT || 4001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`UNO server running on port ${PORT}`);
});
