import { useState, useEffect, useMemo } from 'react';
import io from 'socket.io-client';
import './index.css';
import { QRCodeCanvas } from "qrcode.react";


const alarmSound = new Audio("/alarm.mp3");

export default function App() {
  const [timeLeft, setTimeLeft] = useState(1 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [sessionMessage, setSessionMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [users, setUsers] = useState([]);
  const [sessionSummary, setSessionSummary] = useState("");
  const [username, setUsername] = useState("");
  const [sessionLog, setSessionLog] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

    const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });
  
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);
  

  const socket = useMemo(() => io('http://localhost:4000'), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    const nameParam = params.get("name");

    if (roomParam) setRoom(roomParam);
    if (nameParam) setUsername(nameParam);

    if (roomParam && nameParam) {
      socket.emit("joinRoom", { room: roomParam, username: nameParam });
      setJoined(true);
    }
  }, []);

  useEffect(() => {
    socket.on("userEvent", ({ type, user }) => {
      const message =
        type === "join"
          ? `👋 ${user} joined the session`
          : `👋 ${user} left the session`;
      setSessionMessage(message);
      setTimeout(() => setSessionMessage(""), 5000);
    });

    socket.on("userList", (users) => {
      setUsers(users);
    });

    socket.on("chatMessage", (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });
    return () => {
      socket.off("userEvent");
      socket.off("userList");
      socket.off("chatMessage");
    };
        

    return () => {
      socket.off("userEvent");
      socket.off("userList");
    };
  }, [socket]);

  useEffect(() => {
    const handleSyncState = ({ timeLeft, isRunning, isBreak }) => {
      console.log('🔁 Syncing state from server:', { timeLeft, isRunning, isBreak });
      setTimeLeft(timeLeft);
      setIsRunning(isRunning);
      setIsBreak(isBreak);
    };

    const handleRoomUsers = (userList) => {
      setUsers(userList);
    };

    socket.on('syncState', handleSyncState);
    socket.on('roomUsers', handleRoomUsers);

    return () => {
      socket.off('syncState', handleSyncState);
      socket.off('roomUsers', handleRoomUsers);
    };
  }, []);

  useEffect(() => {
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    let timer;

    if (isRunning && timeLeft > 0) {
      if (document.hasFocus()) {
        timer = setInterval(() => {
          setTimeLeft((prev) => {
            const newTime = prev - 1;
            socket.emit('updateState', { room, timeLeft: newTime, isRunning: true, isBreak });
            return newTime;
          });
        }, 1000);
      }
    } else if (timeLeft === 0 && isRunning) {
      setIsRunning(false);

      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const entry = {
        type: isBreak ? "break" : "focus",
        duration: isBreak ? 5 : 10,
        time: timestamp,
      };
      setSessionLog(prev => [...prev, entry]);

      if (!isMuted) {
        alarmSound.volume = volume;
        alarmSound.play();
      }

      if (Notification.permission === "granted") {
        new Notification(isBreak ? "Break Over!" : "Pomodoro Complete!", {
          body: isBreak ? "Back to focus!" : "Time for a break 🎉",
        });
      }

      if (!isBreak) {
        setSessionMessage("🎯 You stayed focused for 10 minutes!");
        setIsBreak(true);
        setTimeLeft(5 * 60);
        setIsRunning(true);
        generateAISummary("focus");
      } else {
        setSessionMessage("💡 Break over! Ready to focus again?");
        setIsBreak(false);
        setTimeLeft(10 * 60);
        generateAISummary("break");
      }
    }

    return () => clearInterval(timer);
  }, [isRunning, timeLeft]);

  const generateAISummary = async (mode) => {
    const prompt = mode === "focus"
      ? "Give a short motivational message for someone who just completed a 10 minute focus session"
      : "Give a short positive message for someone coming back from a break";

    try {
      const response = await fetch("https://api.openrouter.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer sk-free-key",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openrouter/mistral-7b",
          messages: [{ role: "user", content: prompt }],
        })
      });

      const data = await response.json();
      const aiText = data.choices?.[0]?.message?.content;
      if (aiText) setSessionSummary(aiText);
    } catch (err) {
      setSessionSummary(prev =>
        prev || "Nice job! Keep going!"
      );
    }
  };

  const startSession = () => {
    setIsRunning(true);
    socket.emit('updateState', { room, timeLeft, isRunning: true, isBreak });
  };

  const stopSession = () => {
    setIsRunning(false);
    const resetTime = isBreak ? 5 * 60 : 10 * 60;
    setTimeLeft(resetTime);
    socket.emit('updateState', {
      room,
      timeLeft: resetTime,
      isRunning: false,
      isBreak,
    });
  };

  const pauseSession = () => {
    setIsRunning(false);
    socket.emit('updateState', { room, timeLeft, isRunning: false, isBreak });
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!joined) {
    return (
      <div className="h-screen flex items-center justify-center bg-blue-50">
        <div className="bg-white p-8 rounded-xl shadow-md w-96">
          <h2 className="text-2xl font-bold mb-4">Join a Room</h2>

          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border px-4 py-2 rounded-md w-full mb-4"
          />

          <input
            type="text"
            placeholder="Enter room name"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="border px-4 py-2 rounded-md w-full mb-4"
          />

          <button
            onClick={() => {
              socket.emit("joinRoom", { room, username });
              setJoined(true);
            }}
            className="bg-blue-500 text-white px-6 py-2 rounded-md w-full"
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isBreak ? 'bg-green-100' : 'bg-blue-50'} p-6 overflow-y-auto`}>  
      <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10 flex flex-col md:flex-row gap-6 md:gap-10 items-start w-full max-w-7xl">
      <div className="text-center w-full md:w-1/2">
          <h1 className="text-3xl font-bold mb-6">
            {isBreak ? "Break Time!" : "Pomodoro Buddy"}
          </h1>
          <div className="text-6xl font-mono mb-4">
            {sessionMessage && (
              <div className="text-sm mt-4 text-gray-600 italic">
                {sessionMessage}
              </div>
            )}
            {formatTime(timeLeft)}
          </div>
          <div className="flex justify-center gap-4">
            {!isRunning ? (
              <button
                onClick={startSession}
                className="bg-blue-100 text-blue-600 font-semibold px-6 py-2 rounded-xl border border-blue-300 shadow-sm"
              >
                {timeLeft < 600 && !isBreak ? "Resume" : "Start"}
              </button>
            ) : (
              <>
                <button
                  onClick={pauseSession}
                  className="bg-gray-200 text-gray-700 font-semibold px-6 py-2 rounded-xl border border-gray-300 shadow-sm"
                >
                  Pause
                </button>
                <button
                  onClick={stopSession}
                  className="bg-red-100 text-red-600 font-semibold px-6 py-2 rounded-xl border border-red-300 shadow-sm ml-4"
                >
                  Stop
                </button>
              </>
            )}
          </div>

          <div className="mt-6 text-left space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isMuted}
                onChange={() => setIsMuted(!isMuted)}
              />
              <span className="text-sm text-gray-700">Mute Sound</span>
            </label>
            <label className="block">
              <span className="text-sm text-gray-700">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full"
              />
            </label>
          </div>
          {sessionSummary && (
            <div className="mt-6 text-sm text-green-600 italic">{sessionSummary}</div>
          )}

          <div className="mt-10 bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">🕓 Session History</h2>
            <ul className="space-y-2 max-h-48 overflow-y-auto text-sm text-gray-700">
              {sessionLog.map((entry, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>
                    {entry.type === "focus" ? "✅ Focus" : "☕ Break"}: {entry.duration} min
                  </span>
                  <span>{entry.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-blue-50 rounded-2xl p-6 w-full md:w-60">
          <h2 className="text-lg font-semibold mb-4">Live Sync</h2>
          <ul className="space-y-4 mb-4">
            {users.map(user => (
              <li key={user.id} className="flex items-center gap-3">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <span>{user.name}</span>
              </li>
            ))}
          </ul>
          <div className="text-sm bg-white rounded-xl px-3 py-2 shadow-sm text-gray-600">
            <span className="font-medium text-blue-500">You</span> joined the session
          </div>
        </div>

        <div className="w-full md:w-80 space-y-6 mt-6 md:mt-0">
        <div className="mt-6">
  <h2 className="text-lg font-semibold mb-2">💬 Chat</h2>
  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 max-h-40 overflow-y-auto text-sm space-y-2">
    {chatMessages.map((msg, idx) => (
      <div key={idx} className="text-gray-800 dark:text-gray-100">
        <span className="font-medium">{msg.user}:</span> {msg.text}
      </div>
    ))}
  </div>
  <form
    onSubmit={(e) => {
      e.preventDefault();
      if (newMessage.trim()) {
        socket.emit("chatMessage", { room, user: username, text: newMessage });
        setNewMessage("");
      }
    }}
    className="mt-2 flex gap-2"
  >
    <input
      type="text"
      value={newMessage}
      onChange={(e) => setNewMessage(e.target.value)}
      className="flex-1 px-2 py-1 border rounded text-sm"
      placeholder="Type a message..."
    />
    <button
      type="submit"
      className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
    >
      Send
    </button>
  </form>
</div>

<div className="mt-6">
  <h2 className="text-lg font-semibold mb-2">🔗 Invite Others</h2>
  <div className="bg-white rounded-xl p-4 shadow-md">
    <p className="text-sm text-gray-700 mb-2">
      Invite link:
    </p>
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={`${window.location.origin}/?room=${room}&name=`}
        className="text-xs px-2 py-1 border rounded w-full"
      />
      <button
        onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}/?room=${room}&name=`);
        }}
        className="text-xs bg-blue-500 text-white px-3 py-1 rounded"
      >
        Copy
      </button>
    </div>
    <div className="mt-4 flex flex-col items-center">
      <QRCodeCanvas
        value={`${window.location.origin}/?room=${room}&name=`}
        size={120}
        bgColor="#ffffff"
        fgColor="#000000"
        level="H"
      />
      <p className="mt-2 text-xs text-gray-500">Scan to join</p>
    </div>
  </div>
</div>
</div>


      </div>
    </div>
  );
}
