document.addEventListener('DOMContentLoaded', () => {
    // Global State
    let allSongs = [];
    let currentMode = null; // 'timeline' or 'country'
    let score = 0;
    let lives = 3;
    let isPlaying = false;
    let currentSong = null;

    // Multiplayer State
    let multiplayer = {
        active: false,
        roomCode: null,
        playerName: null,
        isHost: false,
        pollInterval: null,
        players: [],
        ready: false,
        state: 'lobby',
        inviteLink: '',
        gameSeed: null,
        lastBroadcast: null
    };

    // DOM Elements
    const views = {
        menu: document.getElementById('view-menu'),
        timeline: document.getElementById('view-timeline'),
        country: document.getElementById('view-country'),
        leaderboard: document.getElementById('view-leaderboard'),
        lobby: document.getElementById('view-lobby')
    };

    const audioPlayer = document.getElementById('audio-player');
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const statsEl = document.getElementById('game-stats');
    const gameOverModal = document.getElementById('game-over-modal');
    const finalScoreEl = document.getElementById('final-score');
    const playerNameInput = document.getElementById('player-name');
    const inviteLinkInput = document.getElementById('invite-link');
    const inviteLinkBox = document.getElementById('invite-link-container');
    const copyInviteBtn = document.getElementById('btn-copy-invite');
    const shareInviteBtn = document.getElementById('btn-share-invite');
    const readyToggleBtn = document.getElementById('btn-ready-toggle');
    const leaveRoomBtn = document.getElementById('btn-leave-room');
    const hud = document.getElementById('multiplayer-hud');
    const hudRoomCode = document.getElementById('hud-room-code');
    const hudPlayers = document.getElementById('hud-players');
    const hudLeaveBtn = document.getElementById('btn-leave-hud');

    // Buttons
    const timelinePlayBtn = document.getElementById('play-btn');
    const countryPlayBtn = document.getElementById('country-play-btn');
    const modeButtons = [
        document.getElementById('btn-mode-timeline'),
        document.getElementById('btn-mode-country')
    ];

    // Disable buttons initially
    modeButtons.forEach(btn => {
        if (btn) {
            btn.disabled = true;
            btn.textContent += " (Loading...)";
        }
    });

    // Event Listeners for Menu
    if (modeButtons[0]) modeButtons[0].onclick = () => startGame('timeline');
    if (modeButtons[1]) modeButtons[1].onclick = () => startGame('country');
    const multiplayerBtn = document.getElementById('btn-mode-multiplayer');
    if (multiplayerBtn) multiplayerBtn.onclick = () => showView('lobby');

    const leaderboardBtn = document.getElementById('btn-view-leaderboard');
    if (leaderboardBtn) leaderboardBtn.onclick = () => showLeaderboard();

    const backMenuBtns = document.querySelectorAll('#btn-quit-timeline, #btn-quit-country, #btn-back-menu, #btn-back-lobby');
    backMenuBtns.forEach(btn => {
        btn.onclick = () => {
            leaveRoom(true);
            showView('menu');
        };
    });

    // Multiplayer Listeners
    const createRoomBtn = document.getElementById('btn-create-room');
    if (createRoomBtn) createRoomBtn.onclick = () => createRoom();

    const joinRoomBtn = document.getElementById('btn-join-room');
    if (joinRoomBtn) joinRoomBtn.onclick = () => joinRoom();

    const startMultiplayerBtn = document.getElementById('btn-start-multiplayer');
    if (startMultiplayerBtn) startMultiplayerBtn.onclick = () => startMultiplayerGame();

    if (copyInviteBtn) copyInviteBtn.onclick = () => copyInviteLink();
    if (shareInviteBtn) shareInviteBtn.onclick = () => shareInviteLink();
    if (readyToggleBtn) readyToggleBtn.onclick = () => toggleReady();
    [leaveRoomBtn, hudLeaveBtn].forEach(btn => {
        if (btn) btn.onclick = () => leaveRoom();
    });

    hydrateRoomFromQuery();
    window.addEventListener('beforeunload', handleBeforeUnload);

    // --- Multiplayer Logic ---
    function createRoom() {
        const name = document.getElementById('lobby-player-name').value.trim();
        if (!name) { alert("Please enter your name"); return; }

        fetch('/api/room/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host_name: name })
        })
            .then(res => res.json())
            .then(room => setupLobby(room, name, true))
            .catch(() => alert("Failed to create room"));
    }

    function joinRoom() {
        const name = document.getElementById('lobby-player-name').value.trim();
        const codeInput = document.getElementById('room-code-input');
        const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
        if (!name || !code) { alert("Enter name and room code"); return; }

        fetch('/api/room/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, name })
        })
            .then(res => {
                if (!res.ok) throw new Error('Failed to join');
                return res.json();
            })
            .then(room => setupLobby(room, name, false))
            .catch(() => alert("Failed to join room. Check code or name."));
    }

    function setupLobby(room, playerName, isHost) {
        multiplayer.active = true;
        multiplayer.roomCode = room.room_code;
        multiplayer.playerName = playerName;
        multiplayer.isHost = isHost;
        multiplayer.ready = false;
        multiplayer.state = 'lobby';
        multiplayer.players = room.players || [];
        multiplayer.gameSeed = room.song_seed;
        multiplayer.inviteLink = buildInviteLink(room.room_code);
        multiplayer.lastBroadcast = null;

        const lobbyActions = document.getElementById('lobby-actions');
        const lobbyStatus = document.getElementById('lobby-room-status');
        if (lobbyActions) lobbyActions.classList.add('hidden');
        if (lobbyStatus) lobbyStatus.classList.remove('hidden');
        document.getElementById('display-room-code').textContent = room.room_code;

        if (inviteLinkInput) inviteLinkInput.value = multiplayer.inviteLink;
        if (inviteLinkBox) inviteLinkBox.classList.toggle('hidden', !isHost);
        if (readyToggleBtn) readyToggleBtn.classList.remove('hidden');
        if (leaveRoomBtn) leaveRoomBtn.classList.remove('hidden');

        const msg = document.getElementById('lobby-msg');
        if (msg) msg.textContent = isHost ? "You are the host. Start when everyone is ready." : "Waiting for host to start...";

        sendPlayerUpdate({ ready: false, state: 'lobby', score: 0, lives: 3 });
        updateReadyButton();
        updateLobbyUI(room);
        updateHud(room);

        if (multiplayer.pollInterval) clearInterval(multiplayer.pollInterval);
        multiplayer.pollInterval = setInterval(pollRoomStatus, 2000);
    }

    function pollRoomStatus() {
        if (!multiplayer.active || !multiplayer.roomCode) return;

        fetch(`/api/room/status?code=${multiplayer.roomCode}`)
            .then(res => {
                if (!res.ok) throw new Error(String(res.status));
                return res.json();
            })
            .then(room => {
                multiplayer.players = room.players || [];
                updateLobbyUI(room);
                updateHud(room);

                if (room.status === 'playing' && (currentMode !== 'country' || multiplayer.gameSeed !== room.song_seed)) {
                    multiplayer.gameSeed = room.song_seed;
                    startGame('country', room.song_seed);
                }

                if (room.status === 'completed' && multiplayer.state !== 'done') {
                    multiplayer.state = 'done';
                    syncPlayerProgress(true);
                }
            })
            .catch(err => {
                if (String(err.message) === '404') {
                    alert('Room was closed');
                    leaveRoom(true);
                } else {
                    console.warn('Poll error:', err);
                }
            });
    }

    function updateLobbyUI(room) {
        if (!room) return;
        const list = document.getElementById('lobby-player-list');
        if (list) {
            list.innerHTML = room.players.map(player => {
                const isHost = player.name === room.host_name;
                const statusClass = room.status === 'waiting' ? (player.ready ? 'ready' : '') : 'in-game';
                const statusText = formatPlayerStatus(player, room);
                return `<div class="player-row"><div>${player.name}${isHost ? ' <span class="hint">Host</span>' : ''}</div><span class="player-status ${statusClass}">${statusText}</span></div>`;
            }).join('');
        }

        const msg = document.getElementById('lobby-msg');
        if (msg) {
            if (room.status === 'completed') {
                msg.textContent = room.winner ? `${room.winner} won the round!` : 'Round finished.';
            } else if (room.status === 'playing') {
                msg.textContent = 'Round in progress...';
            } else {
                msg.textContent = multiplayer.isHost ? 'You are the host. Start when everyone is ready.' : 'Waiting for host to start...';
            }
        }

        if (readyToggleBtn) readyToggleBtn.classList.toggle('hidden', room.status !== 'waiting');
        updateReadyButton();

        const startBtn = document.getElementById('btn-start-multiplayer');
        if (startBtn) {
            if (multiplayer.isHost) {
                startBtn.classList.remove('hidden');
                const readyPlayers = room.players.filter(p => p.ready);
                const allReady = readyPlayers.length >= 2 && readyPlayers.length === room.players.length;
                startBtn.disabled = !allReady;
                startBtn.textContent = allReady ? 'Start Game' : 'Need 2 ready players';
            } else {
                startBtn.classList.add('hidden');
            }
        }
    }

    function startMultiplayerGame() {
        if (!multiplayer.isHost) return;
        const readyPlayers = multiplayer.players.filter(p => p.ready);
        if (readyPlayers.length < 2 || readyPlayers.length !== multiplayer.players.length) {
            alert('Wait until everyone is ready (min 2 players).');
            return;
        }

        fetch('/api/room/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: multiplayer.roomCode, updates: { status: 'playing' } })
        });
        multiplayer.ready = false;
        updateReadyButton();
    }

    function buildInviteLink(code) {
        const { origin, pathname } = window.location;
        return `${origin}${pathname}?room=${code}`;
    }

    function copyInviteLink() {
        if (!multiplayer.inviteLink) return;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(multiplayer.inviteLink).then(() => {
                alert('Link copied!');
            }).catch(() => alert('Unable to copy link.'));
        } else {
            alert(multiplayer.inviteLink);
        }
    }

    function shareInviteLink() {
        if (!multiplayer.inviteLink) return;
        if (navigator.share) {
            navigator.share({
                title: 'ESC Hitster Room',
                text: 'Join my Hitster room!',
                url: multiplayer.inviteLink
            }).catch(() => copyInviteLink());
        } else {
            copyInviteLink();
        }
    }

    function toggleReady(forceState = null) {
        if (!multiplayer.active) return;
        multiplayer.ready = forceState !== null ? forceState : !multiplayer.ready;
        updateReadyButton();
        sendPlayerUpdate({ ready: multiplayer.ready });
    }

    function updateReadyButton() {
        if (!readyToggleBtn) return;
        readyToggleBtn.textContent = multiplayer.ready ? 'Ready ?' : "I'm Ready";
        readyToggleBtn.classList.toggle('btn-primary', multiplayer.ready);
        readyToggleBtn.classList.toggle('btn-secondary', !multiplayer.ready);
    }

    function sendPlayerUpdate(payload = {}) {
        if (!multiplayer.active || !multiplayer.roomCode || !multiplayer.playerName) return;
        const body = {
            code: multiplayer.roomCode,
            player: Object.assign({ name: multiplayer.playerName }, payload)
        };
        fetch('/api/room/player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).catch(err => console.warn('Player update failed', err));
    }

    function syncPlayerProgress(force = false) {
        if (!multiplayer.active) return;
        const key = `${score}-${lives}-${multiplayer.state}`;
        if (!force && key === multiplayer.lastBroadcast) return;
        multiplayer.lastBroadcast = key;
        sendPlayerUpdate({ score, lives, state: multiplayer.state });
    }

    function leaveRoom(silent = false) {
        if (!multiplayer.active) {
            resetLobbyUI();
            return;
        }

        const payload = {
            code: multiplayer.roomCode,
            name: multiplayer.playerName
        };

        if (multiplayer.pollInterval) {
            clearInterval(multiplayer.pollInterval);
            multiplayer.pollInterval = null;
        }

        fetch('/api/room/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => {
            if (!silent) console.warn('Leave room failed', err);
        });

        resetLobbyUI();
    }

    function resetLobbyUI() {
        multiplayer.active = false;
        multiplayer.roomCode = null;
        multiplayer.players = [];
        multiplayer.ready = false;
        multiplayer.inviteLink = '';
        multiplayer.state = 'lobby';
        multiplayer.lastBroadcast = null;

        const lobbyActions = document.getElementById('lobby-actions');
        const lobbyStatus = document.getElementById('lobby-room-status');
        if (lobbyActions) lobbyActions.classList.remove('hidden');
        if (lobbyStatus) lobbyStatus.classList.add('hidden');
        if (inviteLinkBox) inviteLinkBox.classList.add('hidden');
        if (readyToggleBtn) readyToggleBtn.classList.add('hidden');
        if (leaveRoomBtn) leaveRoomBtn.classList.add('hidden');
        updateHud(null);
    }

    function updateHud(room) {
        if (!hud) return;
        if (!multiplayer.active) {
            hud.classList.add('hidden');
            if (hudRoomCode) hudRoomCode.textContent = '----';
            if (hudPlayers) hudPlayers.innerHTML = '';
            return;
        }

        hud.classList.remove('hidden');
        if (hudRoomCode) hudRoomCode.textContent = multiplayer.roomCode || '----';
        if (hudPlayers && room) {
            hudPlayers.innerHTML = room.players.map(player => {
                const status = formatPlayerStatus(player, room);
                const isSelf = player.name === multiplayer.playerName;
                return `<div class="player-pill${isSelf ? ' self' : ''}"><span>${player.name}</span><span>${status}</span></div>`;
            }).join('');
        }
    }

    function formatPlayerStatus(player, room) {
        if (room.status === 'playing') {
            return `${player.score || 0} pts | ${player.lives ?? 0} lives`;
        }
        if (room.status === 'completed') {
            const tag = room.winner === player.name ? 'Winner' : 'Finished';
            return `${player.score || 0} pts | ${tag}`;
        }
        return player.ready ? 'Ready' : 'Not ready';
    }

    function handleBeforeUnload() {
        if (!multiplayer.active || !multiplayer.roomCode || !multiplayer.playerName) return;
        const payload = JSON.stringify({ code: multiplayer.roomCode, name: multiplayer.playerName });
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/room/leave', new Blob([payload], { type: 'application/json' }));
        }
    }

    function hydrateRoomFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('room');
        if (!code) return;
        const codeInput = document.getElementById('room-code-input');
        if (codeInput) codeInput.value = code.toUpperCase();
        showView('lobby');
    }

    // Game Over Modal Listeners
    const saveScoreBtn = document.getElementById('save-score-btn');
    if (saveScoreBtn) saveScoreBtn.onclick = () => saveScore();

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.onclick = () => showView('menu');

    // Fetch Data
    fetch('data.json')
        .then(res => res.json())
        .then(data => {
            allSongs = data;
            console.log("Loaded songs:", allSongs.length);
            // Enable buttons
            modeButtons.forEach(btn => {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = btn.textContent.replace(" (Loading...)", "");
                }
            });
        })
        .catch(err => {
            console.error("Failed to load data:", err);
            alert("Failed to load game data. Please refresh.");
        });

    // --- Navigation ---
    function showView(viewName) {
        Object.values(views).forEach(el => el.classList.add('hidden'));
        if (views[viewName]) {
            views[viewName].classList.remove('hidden');
        }

        if (viewName === 'menu' || viewName === 'leaderboard') {
            statsEl.classList.add('hidden');
            resetAudioUI();
            return;
        }

        statsEl.classList.remove('hidden');

        // Autoplay only for Timeline mode (per earlier request)
        if (viewName === 'timeline' && audioPlayer && audioPlayer.src) {
            audioPlayer.play()
                .then(() => {
                    isPlaying = true;
                    if (timelinePlayBtn) timelinePlayBtn.textContent = "⏸ Pause";
                    const timelineCard = document.getElementById('current-card');
                    if (timelineCard) timelineCard.classList.add('playing');
                })
                .catch(e => console.error("Playback failed:", e));
        }
    }

    function resetAudioUI() {
        isPlaying = false;

        // Reset Timeline UI
        if (timelinePlayBtn) timelinePlayBtn.textContent = "▶ Play Snippet";
        if (document.getElementById('current-card')) document.getElementById('current-card').classList.remove('playing');

        // Reset Country UI
        if (countryPlayBtn) countryPlayBtn.textContent = "▶ Play Snippet";
        if (document.getElementById('country-card')) document.getElementById('country-card').classList.remove('playing');
    }

    // Global Audio Listeners
    if (timelinePlayBtn) timelinePlayBtn.onclick = () => toggleAudio(timelinePlayBtn, document.getElementById('current-card'));
    if (countryPlayBtn) countryPlayBtn.onclick = () => toggleAudio(countryPlayBtn, document.getElementById('country-card'));

    if (audioPlayer) {
        audioPlayer.onended = () => {
            resetAudioUI();
        };
    }

    function toggleAudio(btn, card) {
        if (isPlaying) {
            stopAudio();
        } else {
            if (audioPlayer.src) {
                audioPlayer.play()
                    .then(() => {
                        isPlaying = true;
                        btn.textContent = "⏸ Pause";
                        if (card) card.classList.add('playing');
                    })
                    .catch(e => console.error("Playback failed:", e));
            }
        }
    }

    function prepareAudio(src) {
        stopAudio();
        if (audioPlayer) {
            audioPlayer.src = src;
            audioPlayer.load();
        }
    }

    function stopAudio() {
        if (audioPlayer) audioPlayer.pause();
        resetAudioUI();
    }

    // --- Game Manager ---
    let randomGenerator = Math.random;

    function startGame(mode, seed = null) {
        currentMode = mode;
        if (seed) {
            // Simple seeded RNG (Mulberry32)
            let s = seed;
            randomGenerator = function () {
                var t = s += 0x6D2B79F5;
                t = Math.imul(t ^ t >>> 15, t | 1);
                t ^= t + Math.imul(t ^ t >>> 7, t | 61);
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
        } else {
            randomGenerator = Math.random;
        }
        score = 0;
        lives = 3;
        if (multiplayer.active) {
            multiplayer.state = 'playing';
            if (seed) {
                multiplayer.gameSeed = seed;
            }
            multiplayer.lastBroadcast = null;
            syncPlayerProgress(true);
        }
        updateStats();
        gameOverModal.classList.add('hidden');
        playerNameInput.value = '';

        if (mode === 'timeline') {
            initTimelineGame();
            showView('timeline');
        } else if (mode === 'country') {
            initCountryGame();
            showView('country');
        }
    }

    function updateStats() {
        scoreEl.textContent = score;
        livesEl.textContent = lives;
        syncPlayerProgress();
    }

    function endGame() {
        stopAudio();
        finalScoreEl.textContent = score;
        if (multiplayer.active) {
            multiplayer.state = 'done';
            syncPlayerProgress(true);
        }
        gameOverModal.classList.remove('hidden');
    }

    // --- Timeline Game Logic ---
    let timeline = [];
    let availableSongs = [];
    const timelineEl = document.getElementById('timeline');

    function initTimelineGame() {
        timeline = [];
        availableSongs = [...allSongs];

        // Pick starter
        const starter = pickRandomSong(availableSongs);
        if (starter) timeline.push(starter);

        renderTimeline();
        nextTimelineTurn();
    }

    function nextTimelineTurn() {
        // Filter unique years for next pick
        const timelineYears = new Set(timeline.map(s => s.year));
        const candidates = availableSongs.filter(s => !timelineYears.has(s.year));

        if (candidates.length === 0) {
            alert("You Win! No more unique years.");
            endGame();
            return;
        }

        currentSong = pickRandomSong(candidates);
        // Remove from available
        const idx = availableSongs.indexOf(currentSong);
        if (idx > -1) availableSongs.splice(idx, 1);

        // Update UI
        // Update UI - HIDE INFO INITIALLY
        document.getElementById('current-artist').textContent = "???";
        document.getElementById('current-title').textContent = "???";

        prepareAudio(currentSong.audio);
        renderTimeline(true);
    }

    function renderTimeline(enableSlots = false) {
        timelineEl.innerHTML = '';
        if (enableSlots) timelineEl.appendChild(createSlot(0));

        timeline.forEach((song, index) => {
            const card = document.createElement('div');
            card.className = 'card placed';
            card.innerHTML = `
                <span class="year-badge">${song.year}</span>
                <h3>${song.title}</h3>
                <p>${song.artist}</p>
            `;
            timelineEl.appendChild(card);
            if (enableSlots) timelineEl.appendChild(createSlot(index + 1));
        });
    }

    function createSlot(index) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.onclick = () => handleTimelineGuess(index);
        return slot;
    }

    function handleTimelineGuess(index) {
        const prevYear = index > 0 ? parseInt(timeline[index - 1].year) : -Infinity;
        const nextYear = index < timeline.length ? parseInt(timeline[index].year) : Infinity;
        const currentYear = parseInt(currentSong.year);

        if (currentYear >= prevYear && currentYear <= nextYear) {
            score++;
            timeline.splice(index, 0, currentSong);
            // alert(`Correct! ${currentSong.year}`);
        } else {
            lives--;
            // alert(`Wrong! It was ${currentSong.year}`);
            if (lives <= 0) {
                // Reveal info on game over
                document.getElementById('current-artist').textContent = currentSong.artist;
                document.getElementById('current-title').textContent = currentSong.title;
                endGame();
                return;
            }
        }

        // Reveal info after guess
        document.getElementById('current-artist').textContent = currentSong.artist;
        document.getElementById('current-title').textContent = currentSong.title;

        updateStats();
        // Small delay to see the info before next turn
        setTimeout(nextTimelineTurn, 500);
    }

    // --- Country Game Logic ---
    const countryOptionsEl = document.getElementById('country-options');

    function initCountryGame() {
        availableSongs = [...allSongs];
        nextCountryTurn();
    }

    function nextCountryTurn() {
        if (availableSongs.length === 0) {
            endGame();
            return;
        }

        currentSong = pickRandomSong(availableSongs);
        // Remove
        const idx = availableSongs.indexOf(currentSong);
        if (idx > -1) availableSongs.splice(idx, 1);

        // Update UI
        // Update UI - HIDE INFO INITIALLY
        document.getElementById('country-artist').textContent = "???";
        document.getElementById('country-title').textContent = "???";

        prepareAudio(currentSong.audio);
        generateCountryOptions();
    }

    function generateCountryOptions() {
        countryOptionsEl.innerHTML = '';
        const correctCountry = currentSong.country;

        // Get 3 random wrong countries
        const allCountries = [...new Set(allSongs.map(s => s.country))];
        const wrongCountries = allCountries.filter(c => c !== correctCountry);
        const options = [correctCountry];

        while (options.length < 4 && wrongCountries.length > 0) {
            const randomIdx = Math.floor(Math.random() * wrongCountries.length);
            options.push(wrongCountries.splice(randomIdx, 1)[0]);
        }

        // Shuffle
        options.sort(() => Math.random() - 0.5);

        options.forEach(country => {
            const btn = document.createElement('button');
            btn.className = 'country-btn';
            btn.textContent = country;
            btn.onclick = () => handleCountryGuess(country, btn);
            countryOptionsEl.appendChild(btn);
        });
    }

    function handleCountryGuess(guess, btn) {
        // Reveal correct answer
        const buttons = countryOptionsEl.querySelectorAll('.country-btn');
        buttons.forEach(b => {
            if (b.textContent === currentSong.country) {
                b.classList.add('correct');
            }
            b.disabled = true; // Prevent multiple clicks
        });

        if (guess === currentSong.country) {
            score++;
            setTimeout(() => {
                updateStats();
                updateStats();
                // Reveal info
                document.getElementById('country-artist').textContent = currentSong.artist;
                document.getElementById('country-title').textContent = currentSong.title;
                setTimeout(nextCountryTurn, 500);
            }, 500);
        } else {
            lives--;
            btn.classList.add('wrong');
            updateStats();
            if (lives <= 0) {
                setTimeout(endGame, 1500);
            } else {
                // Reveal info
                document.getElementById('country-artist').textContent = currentSong.artist;
                document.getElementById('country-title').textContent = currentSong.title;
                setTimeout(nextCountryTurn, 500);
            }
        }
    }

    // --- Shared Helpers ---
    function pickRandomSong(list) {
        if (list.length === 0) return null;
        const index = Math.floor(randomGenerator() * list.length);
        return list[index];
    }

    // --- Leaderboard ---
    function showLeaderboard() {
        showView('leaderboard');
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = 'Loading...';

        fetch('/api/leaderboard')
            .then(res => res.json())
            .then(data => {
                list.innerHTML = '';
                if (data.length === 0) {
                    list.innerHTML = '<p>No scores yet!</p>';
                    return;
                }

                data.forEach((entry, i) => {
                    const item = document.createElement('div');
                    item.className = 'leaderboard-item';
                    item.innerHTML = `
                        <span class="rank">#${i + 1}</span>
                        <span>${entry.name} (${entry.mode})</span>
                        <span class="score">${entry.score}</span>
                    `;
                    list.appendChild(item);
                });
            })
            .catch(err => {
                list.innerHTML = 'Error loading leaderboard.';
                console.error(err);
            });
    }

    function saveScore() {
        const name = playerNameInput.value.trim() || "Anonymous";
        const data = {
            name: name,
            score: score,
            mode: currentMode
        };

        fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(async res => {
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Save failed (${res.status}): ${text || 'Unknown error'}`);
                }
                return res.json();
            })
            .then(() => {
                showLeaderboard();
                gameOverModal.classList.add('hidden');
            })
            .catch(err => {
                console.error('Leaderboard save failed', err);
                alert(err.message || "Failed to save score. Check your connection and try again.");
            });
    }
});
