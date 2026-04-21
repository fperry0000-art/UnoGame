import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { socket } from "./lib/socket";

function Card({ card, onClick, disabled, highlighted, displayColor }) {
  const colorMap = {
    red: "#e53935",
    yellow: "#fdd835",
    green: "#43a047",
    blue: "#1e88e5",
    wild: "#212121",
  };

  const shownColor = displayColor || card.color;
  const darkText = shownColor === "yellow";

  return (
    <motion.button
      whileHover={!disabled ? { y: -8, scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 72,
        height: 110,
        borderRadius: 14,
        border: highlighted ? "3px solid #facc15" : "2px solid #fff",
        background: colorMap[shownColor] || "#444",
        color: darkText ? "#000" : "#fff",
        fontWeight: "bold",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        position: "relative",
        boxShadow: "0 6px 14px rgba(0,0,0,0.45)",
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 8,
          borderRadius: 999,
          border: darkText ? "2px solid rgba(0,0,0,0.22)" : "2px solid rgba(255,255,255,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
          lineHeight: 1,
        }}
      >
        {card.label}
      </div>

      <div
        style={{
          position: "absolute",
          top: 6,
          left: 8,
          fontSize: 12,
          lineHeight: 1,
        }}
      >
        {card.label}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 6,
          right: 8,
          fontSize: 12,
          lineHeight: 1,
          transform: "rotate(180deg)",
        }}
      >
        {card.label}
      </div>
    </motion.button>
  );
}

function ColorButton({ color, onClick }) {
  const colorMap = {
    red: "#d64545",
    yellow: "#e0b100",
    green: "#2f9e44",
    blue: "#1c7ed6",
  };

  return (
    <button
      onClick={onClick}
      style={{
        background: colorMap[color],
        color: color === "yellow" ? "#000" : "#fff",
        border: "none",
        borderRadius: 10,
        padding: "12px 18px",
        fontWeight: "bold",
        cursor: "pointer",
      }}
    >
      {color.toUpperCase()}
    </button>
  );
}

function OpponentFan({ count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", minHeight: 110 }}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          style={{
            width: 26,
            height: 42,
            borderRadius: 6,
            background: "#111",
            border: "2px solid #fff",
            marginLeft: index === 0 ? 0 : -12,
            transform: `rotate(${(index - count / 2) * 3}deg)`,
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          }}
        />
      ))}
    </div>
  );
}

function FacedownTopCard({ onClick, clickable }) {
  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        width: 72,
        height: 110,
        borderRadius: 14,
        border: "2px solid #fff",
        background: "#111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: "bold",
        cursor: clickable ? "pointer" : "default",
        animation: clickable ? "pulse 1.2s infinite" : "none",
        boxShadow: "0 6px 14px rgba(0,0,0,0.45)",
      }}
    >
      {clickable ? "TAP" : "UNO"}
    </div>
  );
}

export default function App() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinedRoom, setJoinedRoom] = useState("");
  const [players, setPlayers] = useState([]);
  const [game, setGame] = useState(null);
  const [socketId, setSocketId] = useState("");
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [pendingWildCard, setPendingWildCard] = useState(null);
  const [scoringEnabled, setScoringEnabled] = useState(true);
  const [targetScore, setTargetScore] = useState(200);
  const [unoOverlayText, setUnoOverlayText] = useState("");

  useEffect(() => {
    let unoTimer;

    function handleConnect() {
      setSocketId(socket.id);
      setIsConnected(true);
    }

    function handleDisconnect() {
      setIsConnected(false);
    }

    function handleJoined(data) {
      setJoinedRoom(data.roomCode);
      setPlayers(data.players || []);
    }

    function handleRoomUpdate(data) {
      setJoinedRoom(data.roomCode);
      setPlayers(data.players || []);
    }

    function handleGameState(nextGame) {
      setGame({ ...nextGame });
      setPendingWildCard(null);

      const msg = nextGame?.statusMessage || "";
      if (msg.toLowerCase().includes("uno")) {
        setUnoOverlayText(msg);
        clearTimeout(unoTimer);
        unoTimer = setTimeout(() => {
          setUnoOverlayText("");
        }, 1800);
      }
    }

    function handleRoomError(data) {
      alert(data.message || "Something went wrong");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room_joined", handleJoined);
    socket.on("room_update", handleRoomUpdate);
    socket.on("game_state", handleGameState);
    socket.on("room_error", handleRoomError);

    if (socket.connected) {
      setSocketId(socket.id);
      setIsConnected(true);
    }

    return () => {
      clearTimeout(unoTimer);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room_joined", handleJoined);
      socket.off("room_update", handleRoomUpdate);
      socket.off("game_state", handleGameState);
      socket.off("room_error", handleRoomError);
    };
  }, []);

  function createRoom() {
    if (!name.trim()) {
      alert("Enter your name");
      return;
    }
    if (!isConnected) {
      alert("Not connected to server");
      return;
    }

    setGame(null);
    setPlayers([]);
    setJoinedRoom("");
    socket.emit("create_room", { name: name.trim() });
  }

  function joinRoom() {
    if (!name.trim() || !roomCode.trim()) {
      alert("Enter name and room code");
      return;
    }
    if (!isConnected) {
      alert("Not connected to server");
      return;
    }

    setGame(null);
    socket.emit("join_room", {
      name: name.trim(),
      roomCode: roomCode.trim().toUpperCase(),
    });
  }

  function startGame() {
    if (!joinedRoom) return;
    socket.emit("start_game", {
      roomCode: joinedRoom,
      scoringEnabled,
      targetScore,
    });
  }

  function flipStartCard() {
    if (!joinedRoom) return;
    socket.emit("flip_start_card", { roomCode: joinedRoom });
  }

  function nextHand() {
    if (!joinedRoom) return;
    socket.emit("next_hand", { roomCode: joinedRoom });
  }

  function playCard(card) {
    if (!joinedRoom || !game) return;

    if (card.color === "wild") {
      setPendingWildCard(card);
      return;
    }

    socket.emit("play_card", { roomCode: joinedRoom, card });
  }

  function playWildWithColor(color) {
    if (!pendingWildCard || !joinedRoom) return;

    socket.emit("play_card", {
      roomCode: joinedRoom,
      card: pendingWildCard,
      chosenColor: color,
    });
  }

  function cancelWild() {
    setPendingWildCard(null);
  }

  function drawCard() {
    if (!joinedRoom || !game) return;
    socket.emit("draw_card", { roomCode: joinedRoom });
  }

  function passDrawnCard() {
    if (!joinedRoom || !game) return;
    socket.emit("pass_drawn_card", { roomCode: joinedRoom });
  }

  function callUno() {
    if (!joinedRoom || !game) return;
    socket.emit("call_uno", { roomCode: joinedRoom });
  }

  function catchUno() {
    if (!joinedRoom || !game) return;
    socket.emit("catch_uno", { roomCode: joinedRoom });
  }

  function acceptWildDrawFour() {
    if (!joinedRoom || !game) return;
    socket.emit("accept_wild_draw_4", { roomCode: joinedRoom });
  }

  function challengeWildDrawFour() {
    if (!joinedRoom || !game) return;
    socket.emit("challenge_wild_draw_4", { roomCode: joinedRoom });
  }

  const myHand = useMemo(() => {
    if (!game || !socketId) return [];
    return game.hands?.[socketId] || [];
  }, [game, socketId]);

  const topCard = useMemo(() => {
    if (!game?.discardPile?.length) return null;
    return game.discardPile[game.discardPile.length - 1];
  }, [game]);

  const currentPlayer = useMemo(() => {
    if (!game?.turnPlayerIds?.length) return null;
    const id = game.turnPlayerIds[game.turnIndex];
    return players.find((p) => p.id === id) || null;
  }, [game, players]);

  const dealerPlayer = useMemo(() => {
    if (!game?.dealerPlayerId) return null;
    return players.find((p) => p.id === game.dealerPlayerId) || null;
  }, [game, players]);

  const handWinner = useMemo(() => {
    if (!game?.handWinnerId) return null;
    return players.find((p) => p.id === game.handWinnerId) || null;
  }, [game, players]);

  const gameWinner = useMemo(() => {
    if (!game?.winnerId) return null;
    return players.find((p) => p.id === game.winnerId) || null;
  }, [game, players]);

  const isMyTurn = currentPlayer?.id === socketId;
  const hasPendingDrawnCard = game?.pendingDrawPlayerId === socketId;
  const pendingDrawnCardId = game?.pendingDrawCardId || null;
  const wildDrawFourPendingForMe = game?.pendingWildDrawFour?.challengerId === socketId;

  if (!joinedRoom) {
    return (
      <div style={{ padding: 30, fontFamily: "Arial, sans-serif" }}>
        <style>{`
          @keyframes unoFlash {
            0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            50% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.82; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          }

          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.06); }
            100% { transform: scale(1); }
          }
        `}</style>

        <h1>UNO Game v4</h1>

        <div style={{ marginBottom: 12 }}>
          <strong>Status:</strong> {isConnected ? "Connected" : "Not connected"}
        </div>

        <div style={{ marginBottom: 12 }}>
          <input
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: 10, fontSize: 16, width: 220 }}
          />
        </div>

        <button onClick={createRoom} style={{ padding: "10px 16px", marginRight: 10 }}>
          Create Room
        </button>

        <div style={{ marginTop: 24 }}>
          <input
            placeholder="Room Code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            style={{ padding: 10, fontSize: 16, width: 160 }}
          />
          <button onClick={joinRoom} style={{ padding: "10px 16px", marginLeft: 10 }}>
            Join Room
          </button>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div style={{ padding: 30, fontFamily: "Arial, sans-serif" }}>
        <style>{`
          @keyframes unoFlash {
            0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            50% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.82; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          }

          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.06); }
            100% { transform: scale(1); }
          }
        `}</style>

        <h1>UNO Game v4</h1>
        <div style={{ marginBottom: 12 }}>
          <strong>Status:</strong> {isConnected ? "Connected" : "Not connected"}
        </div>
        <h2>Room: {joinedRoom}</h2>

        <h3>Players</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>

        <div style={{ marginTop: 20, marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={scoringEnabled}
              onChange={(e) => setScoringEnabled(e.target.checked)}
            />{" "}
            Use scoring / elimination
          </label>

          <label style={{ display: "block" }}>
            Target score:
            <input
              type="number"
              min="10"
              step="10"
              value={targetScore}
              onChange={(e) => setTargetScore(Number(e.target.value) || 200)}
              style={{ marginLeft: 10, padding: 6, width: 90 }}
              disabled={!scoringEnabled}
            />
          </label>
        </div>

        <button onClick={startGame} style={{ padding: "10px 16px", marginTop: 20 }}>
          Start Game
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 20,
        paddingBottom: 160,
        fontFamily: "Arial, sans-serif",
        background: "#14532d",
        minHeight: "100vh",
        color: "#fff",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes unoFlash {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.82; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
      `}</style>

      {unoOverlayText && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "60%",
            transform: "translate(-50%, -50%)",
            zIndex: 9999,
            width: "min(92vw, 420px)",
            padding: 22,
            borderRadius: 18,
            background: "#facc15",
            color: "#111",
            fontWeight: "bold",
            fontSize: "clamp(24px, 6vw, 34px)",
            textAlign: "center",
            boxShadow: "0 0 28px rgba(250,204,21,0.95)",
            animation: "unoFlash 0.7s ease-in-out 3",
            pointerEvents: "none",
          }}
        >
          {unoOverlayText}
        </div>
      )}

      <h1>UNO Game v4</h1>

      <div style={{ marginBottom: 10 }}>
        <strong>Status:</strong> {isConnected ? "Connected" : "Not connected"}
      </div>

      <div style={{ marginBottom: 10 }}>
        <strong>Room:</strong> {joinedRoom}
      </div>

      <div style={{ marginBottom: 10 }}>
        <strong>Dealer:</strong> {dealerPlayer ? dealerPlayer.name : "Unknown"}
      </div>

      <div style={{ marginBottom: 10 }}>
        <strong>Direction:</strong> {game.direction === 1 ? "Clockwise" : "Counterclockwise"}
      </div>

      <div style={{ marginBottom: 10 }}>
        <strong>Turn:</strong> {currentPlayer ? currentPlayer.name : "Unknown"}
      </div>

      <div style={{ marginBottom: 10 }}>
        <strong>Active Color:</strong> {game?.activeColor || game?.chosenColor || "none"}
      </div>

      {isMyTurn && !game.handWinnerId && !game.gameOver && !game.waitingForDealerFlip && (
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 12,
            background: "#22c55e",
            color: "#04130a",
            fontWeight: "bold",
            textAlign: "center",
            animation: "pulse 1s infinite",
          }}
        >
          YOUR TURN
        </div>
      )}

      {game?.statusMessage && !unoOverlayText && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "rgba(255,255,255,0.15)",
            fontWeight: "bold",
          }}
        >
          {game.statusMessage}
        </div>
      )}

      {handWinner && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "#facc15",
            color: "#2b2100",
            fontWeight: "bold",
          }}
        >
          {handWinner.name} won the hand
        </div>
      )}

      {gameWinner && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "#f97316",
            color: "#fff",
            fontWeight: "bold",
          }}
        >
          {gameWinner.name} won the game
        </div>
      )}

      {game.waitingForDealerFlip && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "rgba(59,130,246,0.25)",
            fontWeight: "bold",
          }}
        >
          Tap the facedown card to start the hand.
        </div>
      )}

      {wildDrawFourPendingForMe && !game.handWinnerId && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "rgba(239,68,68,0.28)",
            fontWeight: "bold",
          }}
        >
          You may challenge the Wild Draw 4.
        </div>
      )}

      {hasPendingDrawnCard && !game.handWinnerId && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "rgba(59,130,246,0.25)",
            fontWeight: "bold",
          }}
        >
          You drew a playable card. You may play that card or pass.
        </div>
      )}

      <div style={{ marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={callUno}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            fontWeight: "bold",
            cursor: "pointer",
            background: "#facc15",
            color: "#000",
          }}
        >
          UNO!
        </button>

        <button
          onClick={catchUno}
          disabled={!game?.unoWindowOpen || game?.unoPendingPlayerId === socketId}
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            border: "none",
            fontWeight: "bold",
            fontSize: 18,
            cursor:
              game?.unoWindowOpen && game?.unoPendingPlayerId !== socketId
                ? "pointer"
                : "not-allowed",
            background:
              game?.unoWindowOpen && game?.unoPendingPlayerId !== socketId
                ? "#ef4444"
                : "#7f1d1d",
            color: "#fff",
            opacity:
              game?.unoWindowOpen && game?.unoPendingPlayerId !== socketId ? 1 : 0.5,
            boxShadow:
              game?.unoWindowOpen && game?.unoPendingPlayerId !== socketId
                ? "0 0 18px rgba(239,68,68,0.8)"
                : "none",
          }}
        >
          CALL OUT UNO
        </button>

        <button
          onClick={passDrawnCard}
          disabled={!hasPendingDrawnCard}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            fontWeight: "bold",
            cursor: hasPendingDrawnCard ? "pointer" : "not-allowed",
            background: hasPendingDrawnCard ? "#3b82f6" : "#94a3b8",
            color: "#fff",
            opacity: hasPendingDrawnCard ? 1 : 0.6,
          }}
        >
          Pass Drawn Card
        </button>

        <button
          onClick={challengeWildDrawFour}
          disabled={!wildDrawFourPendingForMe}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            fontWeight: "bold",
            cursor: wildDrawFourPendingForMe ? "pointer" : "not-allowed",
            background: "#ef4444",
            color: "#fff",
            opacity: wildDrawFourPendingForMe ? 1 : 0.6,
          }}
        >
          Challenge +4
        </button>

        <button
          onClick={acceptWildDrawFour}
          disabled={!wildDrawFourPendingForMe}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            fontWeight: "bold",
            cursor: wildDrawFourPendingForMe ? "pointer" : "not-allowed",
            background: "#7c3aed",
            color: "#fff",
            opacity: wildDrawFourPendingForMe ? 1 : 0.6,
          }}
        >
          Take 4
        </button>

        <button
          onClick={nextHand}
          disabled={!game?.handWinnerId || game?.gameOver}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            fontWeight: "bold",
            cursor: game?.handWinnerId && !game?.gameOver ? "pointer" : "not-allowed",
            background: "#14b8a6",
            color: "#042f2e",
            opacity: game?.handWinnerId && !game?.gameOver ? 1 : 0.6,
          }}
        >
          Next Hand
        </button>
      </div>

      {game.scoringEnabled && (
        <div
          style={{
            marginBottom: 24,
            padding: 14,
            borderRadius: 12,
            background: "rgba(255,255,255,0.12)",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>
            Scores — elimination at {game.targetScore}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {players.map((p) => {
              const score = game.scores?.[p.id] || 0;
              const out = game.eliminatedPlayerIds?.includes(p.id);

              return (
                <div
                  key={p.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    minWidth: 110,
                    background: out ? "rgba(239,68,68,0.3)" : "rgba(0,0,0,0.2)",
                  }}
                >
                  <div style={{ fontWeight: "bold" }}>{p.name}</div>
                  <div>{score}</div>
                  <div style={{ fontSize: 12 }}>{out ? "OUT" : "IN"}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 30, flexWrap: "wrap", marginBottom: 30 }}>
        <div>
          <h3>Players</h3>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {players.map((p) => {
              const count = game.hands?.[p.id]?.length || 0;
              const isTurn = currentPlayer?.id === p.id;
              const isOut = game.eliminatedPlayerIds?.includes(p.id);
              const isDealerCard = dealerPlayer?.id === p.id;

              return (
                <div
                  key={p.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: isTurn
                      ? "#22c55e"
                      : isOut
                      ? "rgba(239,68,68,0.25)"
                      : "rgba(255,255,255,0.12)",
                    color: isTurn ? "#04130a" : "#fff",
                    minWidth: 150,
                  }}
                >
                  <div style={{ fontWeight: "bold", marginBottom: 6 }}>
                    {p.name} {isTurn ? "← turn" : ""}
                  </div>

                  <div style={{ marginBottom: 6, fontSize: 12 }}>
                    {isDealerCard ? "Dealer" : ""}
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    {isOut ? "OUT" : `${count} cards`}
                  </div>

                  {p.id === socketId ? (
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Your hand is shown below</div>
                  ) : (
                    <OpponentFan count={isOut ? 0 : count} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div>
            <h3>Top Card</h3>
            {game.waitingForDealerFlip ? (
              <FacedownTopCard onClick={flipStartCard} clickable />
            ) : topCard ? (
              <Card
                card={topCard}
                disabled
                displayColor={
                  topCard.color === "wild"
                    ? game?.activeColor || game?.chosenColor
                    : undefined
                }
              />
            ) : (
              <div>No card</div>
            )}
          </div>
        </div>

        <div>
          <h3>Draw Pile</h3>
          <button
            onClick={drawCard}
            disabled={
              !isMyTurn ||
              !!game.handWinnerId ||
              !!game.pendingWildDrawFour ||
              !!game.waitingForDealerFlip
            }
            style={{
              width: 70,
              height: 100,
              borderRadius: 12,
              border: "2px solid #fff",
              background: "#111",
              color: "#fff",
              fontWeight: "bold",
              opacity:
                !isMyTurn || game.handWinnerId || game.pendingWildDrawFour || game.waitingForDealerFlip
                  ? 0.6
                  : 1,
            }}
          >
            DRAW
          </button>
          <div style={{ marginTop: 8 }}>{game.drawPile?.length || 0} left</div>
        </div>
      </div>

      {pendingWildCard && (
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            background: "rgba(255,255,255,0.12)",
            borderRadius: 12,
          }}
        >
          <h3>Choose a color</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <ColorButton color="red" onClick={() => playWildWithColor("red")} />
            <ColorButton color="yellow" onClick={() => playWildWithColor("yellow")} />
            <ColorButton color="green" onClick={() => playWildWithColor("green")} />
            <ColorButton color="blue" onClick={() => playWildWithColor("blue")} />
            <button
              onClick={cancelWild}
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div>
        <h3>Your Hand</h3>
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            width: "100%",
            background: "rgba(0,0,0,0.7)",
            padding: 10,
            display: "flex",
            justifyContent: "center",
            gap: 10,
            flexWrap: "nowrap",
            overflowX: "auto",
            zIndex: 1000,
          }}
        >
          {myHand.map((card) => {
            const highlighted = hasPendingDrawnCard && pendingDrawnCardId === card.id;
            const disabled =
              (hasPendingDrawnCard && pendingDrawnCardId !== card.id) ||
              !!game.handWinnerId ||
              !!game.gameOver ||
              !isMyTurn ||
              !!game.pendingWildDrawFour ||
              !!game.waitingForDealerFlip;

            return (
              <Card
                key={card.id}
                card={card}
                onClick={() => playCard(card)}
                disabled={disabled}
                highlighted={highlighted}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}