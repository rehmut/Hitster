document.addEventListener('DOMContentLoaded', () => {
    // Global State
    let allSongs = [];
    let currentMode = null; // 'timeline' | 'country' | 'esc2026-country'
    let score = 0;
    let lives = 3;
    let isPlaying = false;
    let audioMuted = false;
    let predictorSnippetPlayId = 0;
    let currentSong = null;
    let countryModeSettings = {
        optionCountries: []
    };
    let predictorConfig = null;
    let predictorState = null;
    let predictorDragState = null;
    let predictorSelectedAct = null;
    let predictorPlayingKey = null;

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
        home: document.getElementById('view-home'),
        menu: document.getElementById('view-menu'),
        timeline: document.getElementById('view-timeline'),
        country: document.getElementById('view-country'),
        leaderboard: document.getElementById('view-leaderboard'),
        lobby: document.getElementById('view-lobby'),
        prediction: document.getElementById('view-prediction'),
        'prediction-rules': document.getElementById('view-prediction-rules')
    };

    const audioPlayer = document.getElementById('audio-player');
    const audioToggleBtn = document.getElementById('audio-toggle');
    if (audioPlayer) {
        audioPlayer.addEventListener('ended', stopPredictorSnippet);
        audioPlayer.addEventListener('pause', () => {
            if (!audioPlayer.ended) return;
            stopPredictorSnippet();
        });
    }
    const leaderboardTabs = document.getElementById('leaderboard-tabs');
    const leaderboardList = document.getElementById('leaderboard-list');
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
        document.getElementById('btn-mode-predictor'),
        document.getElementById('btn-mode-timeline'),
        document.getElementById('btn-mode-country'),
        document.getElementById('btn-mode-esc2026')
    ];

    // Disable buttons initially
    modeButtons.forEach(btn => {
        if (btn) {
            btn.disabled = true;
            btn.textContent += " (Loading...)";
        }
    });

    // Event Listeners for Menu
    if (modeButtons[0]) modeButtons[0].onclick = () => startGame('predictor');
    if (modeButtons[1]) modeButtons[1].onclick = () => startGame('timeline');
    if (modeButtons[2]) modeButtons[2].onclick = () => startGame('country');
    if (modeButtons[3]) modeButtons[3].onclick = () => startGame('esc2026-country');
    if (audioToggleBtn) audioToggleBtn.onclick = () => toggleGlobalMute();
    const multiplayerBtn = document.getElementById('btn-mode-multiplayer');
    if (multiplayerBtn) multiplayerBtn.onclick = () => showView('lobby');

    const leaderboardBtn = document.getElementById('btn-view-leaderboard');
    if (leaderboardBtn) leaderboardBtn.onclick = () => showLeaderboard();
    if (leaderboardTabs) {
        leaderboardTabs.querySelectorAll('.leaderboard-tab').forEach(btn => {
            btn.onclick = () => showLeaderboard(btn.dataset.mode || 'prediction');
        });
    }
    const topNav = document.getElementById('top-nav');
    if (topNav) {
        topNav.querySelectorAll('.nav-pill').forEach(btn => {
            btn.onclick = () => {
                const targetView = btn.dataset.view || 'menu';
                if (targetView === 'leaderboard') showLeaderboard();
                else showView(targetView);
            };
        });
    }

    const backMenuBtns = document.querySelectorAll('#btn-quit-timeline, #btn-quit-country, #btn-back-menu, #btn-back-lobby');
    backMenuBtns.forEach(btn => {
        btn.onclick = () => {
            leaveRoom(true);
            showView('menu');
        };
    });
    const backRulesBtn = document.getElementById('btn-back-rules');
    if (backRulesBtn) backRulesBtn.onclick = () => showView('prediction');

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
    Promise.all([
        fetch('data.json').then(res => res.json()),
        fetch('prediction-2026.json').then(res => {
            if (!res.ok) return null;
            return res.json();
        }).catch(() => null)
    ])
        .then(([songs, prediction]) => {
            allSongs = songs;
            predictorConfig = prediction || buildFallbackPredictionConfig(songs);
            initPredictorState();
            console.log("Loaded songs:", allSongs.length);
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
        updateTopNav(viewName);

        if (viewName === 'home' || viewName === 'menu' || viewName === 'leaderboard' || viewName === 'prediction' || viewName === 'prediction-rules') {
            statsEl.classList.add('hidden');
            resetAudioUI();
            if (viewName === 'prediction') renderPredictor();
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
    updateGlobalMuteUI();

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
            audioPlayer.muted = audioMuted;
            audioPlayer.load();
        }
    }

    function stopAudio() {
        if (audioPlayer) audioPlayer.pause();
        resetAudioUI();
    }

    function toggleGlobalMute() {
        audioMuted = !audioMuted;
        if (audioPlayer) audioPlayer.muted = audioMuted;
        updateGlobalMuteUI();
    }

    function updateGlobalMuteUI() {
        if (!audioToggleBtn) return;
        audioToggleBtn.classList.toggle('is-muted', audioMuted);
        audioToggleBtn.setAttribute('aria-pressed', String(audioMuted));
        audioToggleBtn.setAttribute('aria-label', audioMuted ? 'Unmute sound' : 'Mute sound');
        audioToggleBtn.title = audioMuted ? 'Unmute sound' : 'Mute sound';
    }

    // --- Game Manager ---
    let randomGenerator = Math.random;

    function startGame(mode, seed = null) {
        const esc2026Pool = allSongs.filter(song => String(song.year) === '2026');
        if (mode === 'esc2026-country' && esc2026Pool.length === 0) {
            alert('No ESC 2026 songs found in data.json yet. Add entries with year "2026" first.');
            return;
        }

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
        const countryModeTitle = document.getElementById('country-mode-title');
        if (countryModeTitle) {
            countryModeTitle.textContent = mode === 'esc2026-country'
                ? 'Guess the Country (ESC 2026)'
                : 'Guess the Country';
        }

        if (mode === 'timeline') {
            initTimelineGame();
            showView('timeline');
        } else if (mode === 'country') {
            initCountryGame({ songs: allSongs });
            showView('country');
        } else if (mode === 'esc2026-country') {
            initCountryGame({ songs: esc2026Pool });
            showView('country');
        } else if (mode === 'predictor') {
            showView('prediction');
        }
    }

    function updateStats() {
        scoreEl.textContent = score;
        livesEl.textContent = lives;
        syncPlayerProgress();
    }

    function endGame(isWin = false) {
        stopAudio();
        finalScoreEl.textContent = score;
        if (multiplayer.active) {
            multiplayer.state = 'done';
            syncPlayerProgress(true);
        }
        const emoji = document.getElementById('modal-emoji');
        const title = document.getElementById('modal-title');
        const subtitle = document.getElementById('modal-subtitle');
        if (isWin) {
            gameOverModal.classList.add('win');
            if (emoji) emoji.textContent = '🏆';
            if (title) title.textContent = 'You Win!';
            if (subtitle) subtitle.textContent = 'You placed every song — perfect run!';
        } else {
            gameOverModal.classList.remove('win');
            if (emoji) emoji.textContent = '💀';
            if (title) title.textContent = 'Game Over!';
            if (subtitle) subtitle.textContent = '';
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
            endGame(true);
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
        const yearReveal = document.getElementById('current-year');
        if (yearReveal) { yearReveal.textContent = ''; yearReveal.parentElement.classList.add('hidden'); }

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
                <div class="card-field">
                    <span class="field-label">Year</span>
                    <span class="year-badge">${song.year}</span>
                </div>
                <div class="card-divider"></div>
                <div class="card-field">
                    <span class="field-label">Title</span>
                    <h3>${song.title}</h3>
                </div>
                <div class="card-divider"></div>
                <div class="card-field">
                    <span class="field-label">Artist</span>
                    <p>${song.artist}</p>
                </div>
            `;
            timelineEl.appendChild(card);
            if (enableSlots) timelineEl.appendChild(createSlot(index + 1));
        });
    }

    function createSlot(index) {
        const slot = document.createElement('div');
        slot.className = 'slot';

        const prevYear = index > 0 ? timeline[index - 1].year : null;
        const nextYear = index < timeline.length ? timeline[index].year : null;

        let label;
        if (!prevYear)       label = `Before ${nextYear}`;
        else if (!nextYear)  label = `After ${prevYear}`;
        else                 label = `${prevYear} \u2192 ${nextYear}`;

        slot.innerHTML = `<span class="slot-icon">+</span><span class="slot-label">Place here: <b>${label}</b></span>`;
        slot.onclick = () => handleTimelineGuess(index);
        return slot;
    }

    function handleTimelineGuess(index) {
        const prevYear = index > 0 ? parseInt(timeline[index - 1].year) : -Infinity;
        const nextYear = index < timeline.length ? parseInt(timeline[index].year) : Infinity;
        const currentYear = parseInt(currentSong.year);

        let correct = false;
        if (currentYear >= prevYear && currentYear <= nextYear) {
            correct = true;
            score++;
            timeline.splice(index, 0, currentSong);
        } else {
            lives--;
            const yearRevealEl = document.getElementById('current-year');
            if (yearRevealEl) { yearRevealEl.textContent = currentSong.year; yearRevealEl.parentElement.classList.remove('hidden'); }
            if (lives <= 0) {
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
        // Correct: move on quickly. Wrong: linger so player can read the answer.
        setTimeout(nextTimelineTurn, correct ? 600 : 3000);
    }

    // --- Country Game Logic ---
    const COUNTRY_REVEAL_MS = 4000;
    const countryOptionsEl = document.getElementById('country-options');

    function initCountryGame(settings = {}) {
        const songs = Array.isArray(settings.songs) ? settings.songs : allSongs;
        availableSongs = [...songs];
        countryModeSettings = {
            optionCountries: [...new Set(songs.map(song => song.country))]
        };
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
        document.getElementById('country-artist').textContent = "???";
        document.getElementById('country-title').textContent = "???";

        prepareAudio(currentSong.audio);
        generateCountryOptions();
    }

    function generateCountryOptions() {
        countryOptionsEl.innerHTML = '';
        const correctCountry = currentSong.country;

        // Get 3 random wrong countries
        const allCountries = countryModeSettings.optionCountries.length > 0
            ? countryModeSettings.optionCountries
            : [...new Set(allSongs.map(s => s.country))];
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
            updateStats();
            document.getElementById('country-artist').textContent = currentSong.artist;
            document.getElementById('country-title').textContent = currentSong.title;
            setTimeout(nextCountryTurn, COUNTRY_REVEAL_MS);
        } else {
            lives--;
            btn.classList.add('wrong');
            updateStats();
            document.getElementById('country-artist').textContent = currentSong.artist;
            document.getElementById('country-title').textContent = currentSong.title;
            if (lives <= 0) {
                setTimeout(endGame, COUNTRY_REVEAL_MS);
            } else {
                // Reveal info — give player time to read the correct answer
                setTimeout(nextCountryTurn, COUNTRY_REVEAL_MS);
            }
        }
    }

    // --- Predictor Logic ---
    function buildFallbackPredictionConfig(songs) {
        const esc2026 = songs.filter(song => String(song.year) === '2026');
        const acts = esc2026.map(song => ({ country: song.country, artist: song.artist, title: song.title }));
        return {
            season: '2026',
            semi1Acts: acts.filter((_, i) => i % 2 === 0),
            semi2Acts: acts.filter((_, i) => i % 2 === 1),
            qualifiedForFinal: [],
            results: {
                semi1: [],
                semi2: [],
                final: []
            }
        };
    }

    function initPredictorState() {
        if (!predictorConfig) return;
        const saved = loadSavedPredictorPicks();
        predictorState = {
            semi1: normalizeSemiPicks(saved?.semi1, predictorConfig.semi1Acts || []),
            semi2: normalizeSemiPicks(saved?.semi2, predictorConfig.semi2Acts || []),
            final: Array.from({ length: 10 }, (_, i) => saved?.final?.[i] || null),
            locks: {
                semi1: Boolean(saved?.locks?.semi1),
                semi2: Boolean(saved?.locks?.semi2)
            }
        };
        normalizePredictorLocks();

        const saveBtn = document.getElementById('btn-predictor-save');
        const loadBtn = document.getElementById('btn-predictor-load');
        const resetBtn = document.getElementById('btn-predictor-reset');
        if (saveBtn) saveBtn.onclick = savePredictorSubmission;
        if (loadBtn) loadBtn.onclick = loadSubmittedPredictorPicks;
        if (resetBtn) {
            resetBtn.onclick = () => {
                predictorState = { semi1: {}, semi2: {}, final: Array(10).fill(null), locks: { semi1: false, semi2: false } };
                savePredictorPicks();
                renderPredictor();
            };
        }
    }

    async function loadSubmittedPredictorPicks() {
        if (!predictorConfig || !predictorState) return;
        const totalEl = document.getElementById('predictor-score-total');
        const breakdownEl = document.getElementById('predictor-score-breakdown');
        const storedName = localStorage.getItem('esc-predictor-player-name') || '';
        const name = (window.prompt('Name used for the saved picks:', storedName) || '').trim();
        if (!name) return;

        if (totalEl) totalEl.textContent = 'Loading saved picks...';
        if (breakdownEl) breakdownEl.textContent = '';

        try {
            const entries = await fetchPredictionLeaderboard();
            const season = String(predictorConfig.season || '2026');
            const match = (entries || []).find(entry =>
                String(entry.season || season) === season &&
                String(entry.name || '').trim().toLowerCase() === name.toLowerCase()
            );
            if (!match) {
                if (totalEl) totalEl.textContent = 'No saved picks found for that name.';
                return;
            }

            applySubmittedPredictorPicks(match.picks || {});
            localStorage.setItem('esc-predictor-player-name', match.name || name);
            savePredictorPicks(false);
            renderPredictor();
            if (totalEl) totalEl.textContent = `Loaded saved picks for ${match.name || name}.`;
            if (breakdownEl) breakdownEl.textContent = 'Unlock a semifinal, edit it, lock it again, then Save Picks.';
        } catch (err) {
            console.error('Prediction load failed', err);
            if (totalEl) totalEl.textContent = 'Could not load saved picks.';
            if (breakdownEl) breakdownEl.textContent = err.message || 'Leaderboard load failed.';
        }
    }

    function applySubmittedPredictorPicks(savedPicks) {
        const semi1 = normalizeSemiPicks(savedPicks.semi1, predictorConfig.semi1Acts || []);
        const semi2 = normalizeSemiPicks(savedPicks.semi2, predictorConfig.semi2Acts || []);
        predictorState.semi1 = semi1;
        predictorState.semi2 = semi2;
        predictorState.final = normalizeFinalPicks(savedPicks.final, predictorConfig.qualifiedForFinal || []);
        predictorState.locks = {
            semi1: countQualifiersInBoard(semi1) === 10,
            semi2: countQualifiersInBoard(semi2) === 10
        };
    }

    function normalizeFinalPicks(savedFinal, acts) {
        if (!Array.isArray(savedFinal)) return Array(10).fill(null);
        const byCountry = new Map((acts || []).map(act => [act.country, act]));
        return Array.from({ length: 10 }, (_, i) => {
            const pick = savedFinal[i];
            if (!pick) return null;
            if (typeof pick === 'object' && pick.country) return pick;
            return byCountry.get(pick) || null;
        });
    }

    function countQualifiersInBoard(board) {
        return Object.values(board || {}).filter(value => value === true).length;
    }

    function normalizeSemiPicks(savedBoard, acts) {
        const normalized = {};
        if (Array.isArray(savedBoard)) {
            savedBoard.filter(Boolean).forEach(act => {
                normalized[act.country] = true;
            });
            return normalized;
        }
        if (savedBoard && typeof savedBoard === 'object') {
            acts.forEach(act => {
                if (savedBoard[act.country] === true || savedBoard[act.country] === false) {
                    normalized[act.country] = savedBoard[act.country];
                }
            });
        }
        return normalized;
    }

    function loadSavedPredictorPicks() {
        try {
            return JSON.parse(localStorage.getItem('esc-predictor-2026') || 'null');
        } catch {
            return null;
        }
    }

    function savePredictorPicks(showMessage = true) {
        if (!predictorState) return;
        normalizePredictorLocks();
        localStorage.setItem('esc-predictor-2026', JSON.stringify(predictorState));
        const totalEl = document.getElementById('predictor-score-total');
        if (showMessage && totalEl) totalEl.textContent = 'Draft saved on this device.';
    }

    function normalizePredictorLocks() {
        predictorState.locks = predictorState.locks || {};
        predictorState.locks.semi1 = Boolean(predictorState.locks.semi1) && countSemiQualifiers('semi1') === 10;
        predictorState.locks.semi2 = Boolean(predictorState.locks.semi2) && countSemiQualifiers('semi2') === 10;
    }

    async function savePredictorSubmission() {
        if (!predictorState) return;
        savePredictorPicks();

        const totalEl = document.getElementById('predictor-score-total');
        const breakdownEl = document.getElementById('predictor-score-breakdown');
        const picks = buildSubmittedPredictorPicks();
        if (Object.keys(picks).length === 0) {
            if (totalEl) totalEl.textContent = 'Draft saved on this device.';
            if (breakdownEl) breakdownEl.textContent = 'Lock a semifinal to save it to the leaderboard.';
            renderPredictor();
            return;
        }

        const storedName = localStorage.getItem('esc-predictor-player-name') || '';
        const name = (window.prompt('Name for the prediction leaderboard:', storedName) || '').trim() || 'Anonymous';
        localStorage.setItem('esc-predictor-player-name', name);

        const payload = {
            name,
            season: predictorConfig?.season || '2026',
            picks
        };

        if (totalEl) totalEl.textContent = 'Saving picks...';
        if (breakdownEl) breakdownEl.textContent = '';

        try {
            const response = await fetch('/api/predictions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(extractServerError(text) || `Submit failed (${response.status})`);
            }
            const result = await response.json();
            const score = result.submission?.score;
            if (totalEl) totalEl.textContent = `Picks saved for ${name}. Current score: ${score?.total ?? 0}`;
            if (breakdownEl && score) {
                breakdownEl.textContent = `Semi 1: ${score.semi1.points}/${score.semi1.max} | Semi 2: ${score.semi2.points}/${score.semi2.max} | Final: ${score.final.points}`;
            }
        } catch (err) {
            console.error('Prediction save failed', err);
            if (totalEl) totalEl.textContent = 'Could not save picks to the leaderboard.';
            if (breakdownEl) breakdownEl.textContent = err.message || 'Server submission failed.';
        }
    }

    function buildSubmittedPredictorPicks() {
        normalizePredictorLocks();
        const picks = {};
        if (predictorState.locks?.semi1) {
            picks.semi1 = predictorState.semi1 || {};
        }
        if (predictorState.locks?.semi2) {
            picks.semi2 = predictorState.semi2 || {};
        }
        const finalPicks = (predictorState.final || []).filter(Boolean);
        if (finalPicks.length > 0) {
            picks.final = predictorState.final || [];
        }
        return picks;
    }

    function extractServerError(text) {
        if (!text) return '';
        const titleMatch = text.match(/<p>Message:\s*([^<]+)<\/p>/i);
        if (titleMatch) return titleMatch[1];
        return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function renderPredictor() {
        if (!predictorConfig || !predictorState) return;
        renderPredictorBoard('semi1', predictorConfig.semi1Acts || [], true);
        renderPredictorBoard('semi2', predictorConfig.semi2Acts || [], true);
        const finalUnlocked = (predictorConfig.qualifiedForFinal || []).length > 0;
        renderPredictorBoard('final', predictorConfig.qualifiedForFinal || [], finalUnlocked);

        const finalSub = document.getElementById('final-predictor-sub');
        if (finalSub) {
            finalSub.textContent = finalUnlocked
                ? 'Top 10 final placements'
                : 'Unlocks when qualifiedForFinal is filled in prediction-2026.json';
        }
        const statusText = document.getElementById('predictor-status-text');
        if (statusText) {
            statusText.textContent = finalUnlocked
                ? 'Semifinals are set. Predict the Grand Final top 10 too.'
                : 'Pick each semifinal act as qualifier or non-qualifier. Final prediction unlocks after semifinals are complete.';
        }
    }

    function renderPredictorBoard(boardKey, acts, enabled) {
        if (boardKey === 'semi1' || boardKey === 'semi2') {
            renderSemiQualifierBoard(boardKey, acts);
            return;
        }

        renderFinalRankingBoard(boardKey, acts, enabled);
    }

    function renderSemiQualifierBoard(boardKey, acts) {
        const poolEl = document.getElementById(`${boardKey}-pool`);
        if (!poolEl) return;

        const picks = predictorState[boardKey] || {};
        const locked = Boolean(predictorState.locks?.[boardKey]);
        const qualifierCount = countSemiQualifiers(boardKey);
        poolEl.innerHTML = '';
        const lockPanel = document.createElement('div');
        lockPanel.className = `semi-lock-panel${locked ? ' locked' : ''}`;
        lockPanel.innerHTML = `
            <div>
                <strong>${qualifierCount}/10 qualifiers picked</strong>
                <span>${locked ? 'Picks are locked.' : 'Pick exactly 10 qualifiers to lock this semifinal.'}</span>
            </div>
            <button class="semi-lock-btn" type="button" ${!locked && qualifierCount !== 10 ? 'disabled' : ''}>
                ${locked ? 'Unlock picks' : 'Lock semifinal'}
            </button>
        `;
        const lockBtn = lockPanel.querySelector('.semi-lock-btn');
        lockBtn.onclick = () => toggleSemiLock(boardKey);
        poolEl.appendChild(lockPanel);

        acts.forEach(act => {
            const pick = picks[act.country];
            const yesDisabled = locked || (pick !== true && qualifierCount >= 10);
            const isPlayingAct = isPredictorActPlaying(act);
            const card = document.createElement('div');
            card.className = `semi-act-card${pick === true ? ' picked-yes' : ''}${pick === false ? ' picked-no' : ''}${locked ? ' locked' : ''}${isPlayingAct ? ' is-playing' : ''}`;
            card.innerHTML = `
                <button class="semi-act-main" type="button" aria-label="${isPlayingAct ? 'Stop' : 'Play'} ${act.country}">
                    <span class="play-indicator" aria-hidden="true"></span>
                    <span class="semi-country">${act.country}</span>
                    <span class="semi-song">${act.artist} - ${act.title}</span>
                </button>
                <div class="semi-pick-controls" aria-label="Prediction for ${act.country}">
                    <button class="semi-pick yes" type="button" aria-pressed="${pick === true}" ${yesDisabled ? 'disabled' : ''}>✓</button>
                    <button class="semi-pick no" type="button" aria-pressed="${pick === false}" ${locked ? 'disabled' : ''}>×</button>
                </div>
            `;

            const mainBtn = card.querySelector('.semi-act-main');
            const yesBtn = card.querySelector('.semi-pick.yes');
            const noBtn = card.querySelector('.semi-pick.no');
            mainBtn.onclick = () => playPredictorSnippet(act);
            yesBtn.onclick = () => setSemiPick(boardKey, act.country, true);
            noBtn.onclick = () => setSemiPick(boardKey, act.country, false);
            poolEl.appendChild(card);
        });
    }

    function setSemiPick(boardKey, country, willQualify) {
        if (predictorState.locks?.[boardKey]) return;
        predictorState[boardKey] = predictorState[boardKey] || {};
        if (willQualify && predictorState[boardKey][country] !== true && countSemiQualifiers(boardKey) >= 10) return;
        if (predictorState[boardKey][country] === willQualify) {
            delete predictorState[boardKey][country];
        } else {
            predictorState[boardKey][country] = willQualify;
        }
        savePredictorPicks(false);
        renderPredictor();
    }

    function countSemiQualifiers(boardKey) {
        return Object.values(predictorState?.[boardKey] || {}).filter(value => value === true).length;
    }

    function toggleSemiLock(boardKey) {
        predictorState.locks = predictorState.locks || { semi1: false, semi2: false };
        if (!predictorState.locks[boardKey] && countSemiQualifiers(boardKey) !== 10) return;
        predictorState.locks[boardKey] = !predictorState.locks[boardKey];
        savePredictorPicks();
        renderPredictor();
    }

    function renderFinalRankingBoard(boardKey, acts, enabled) {
        const slotsEl = document.getElementById(`${boardKey}-slots`);
        const poolEl = document.getElementById(`${boardKey}-pool`);
        if (!slotsEl || !poolEl) return;

        const picks = predictorState[boardKey] || [];
        const pickedCountries = new Set(picks.filter(Boolean).map(act => act.country));
        const poolActs = acts.filter(act => !pickedCountries.has(act.country));

        slotsEl.innerHTML = '';
        for (let i = 0; i < 10; i++) {
            const li = document.createElement('li');
            li.className = `rank-slot${enabled ? '' : ' disabled'}`;
            li.dataset.board = boardKey;
            li.dataset.slotIndex = String(i);
            const picked = picks[i];
            if (picked) {
                li.innerHTML = `<span class="rank-index">${i + 1}</span><span class="rank-country">${picked.country}</span><span class="rank-meta">${picked.artist} - ${picked.title}</span><button class="slot-remove" type="button">×</button>`;
                li.draggable = enabled;
                li.addEventListener('dragstart', () => {
                    predictorDragState = { type: 'slot', boardKey, slotIndex: i, act: picked };
                });
                const removeBtn = li.querySelector('.slot-remove');
                if (removeBtn) {
                    removeBtn.onclick = (ev) => {
                        ev.stopPropagation();
                        predictorState[boardKey][i] = null;
                        renderPredictor();
                    };
                }
            } else {
                li.innerHTML = `<span class="rank-index">${i + 1}</span><span class="rank-empty">${enabled ? 'Drop an act here' : 'Locked'}</span>`;
            }

            li.addEventListener('dragover', ev => {
                if (!enabled) return;
                ev.preventDefault();
                li.classList.add('drag-over');
            });
            li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
            li.addEventListener('drop', ev => {
                li.classList.remove('drag-over');
                if (!enabled) return;
                ev.preventDefault();
                handlePredictorDrop(boardKey, i);
            });
            li.addEventListener('click', () => {
                if (!enabled || !predictorSelectedAct) return;
                if (predictorSelectedAct.boardKey !== boardKey) return;
                placeActInPredictorSlot(boardKey, i, predictorSelectedAct.act);
                predictorSelectedAct = null;
                renderPredictor();
            });
            slotsEl.appendChild(li);
        }

        poolEl.innerHTML = '';
        poolActs.forEach(act => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `pool-act${enabled ? '' : ' disabled'}`;
            if (isPredictorActPlaying(act)) {
                btn.classList.add('is-playing');
            }
            if (predictorSelectedAct && predictorSelectedAct.boardKey === boardKey && predictorSelectedAct.act.country === act.country) {
                btn.classList.add('selected');
            }
            const indicator = document.createElement('span');
            indicator.className = 'play-indicator';
            indicator.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = `${act.country} - ${act.artist}`;
            btn.append(indicator, label);
            btn.draggable = enabled;
            btn.onclick = () => {
                if (!enabled) return;
                predictorSelectedAct = { boardKey, act };
                playPredictorSnippet(act);
                renderPredictor();
            };
            btn.addEventListener('dragstart', () => {
                predictorDragState = { type: 'pool', boardKey, act };
                playPredictorSnippet(act);
            });
            poolEl.appendChild(btn);
        });
    }

    function handlePredictorDrop(targetBoard, targetSlotIndex) {
        if (!predictorDragState) return;
        if (predictorDragState.boardKey !== targetBoard) return;

        const targetAct = predictorState[targetBoard][targetSlotIndex];
        if (predictorDragState.type === 'pool') {
            placeActInPredictorSlot(targetBoard, targetSlotIndex, predictorDragState.act);
        } else if (predictorDragState.type === 'slot') {
            const sourceIndex = predictorDragState.slotIndex;
            if (sourceIndex === targetSlotIndex) return;
            predictorState[targetBoard][sourceIndex] = targetAct || null;
            predictorState[targetBoard][targetSlotIndex] = predictorDragState.act;
        }

        predictorDragState = null;
        predictorSelectedAct = null;
        renderPredictor();
    }

    function placeActInPredictorSlot(boardKey, slotIndex, actToPlace) {
        predictorState[boardKey][slotIndex] = actToPlace;
        predictorState[boardKey] = predictorState[boardKey].map((act, idx) => {
            if (idx === slotIndex) return act;
            return act && act.country === actToPlace.country ? null : act;
        });
    }

    async function playPredictorSnippet(act) {
        if (!act) return;
        const source = resolvePredictorActAudio(act);
        if (!source || !audioPlayer) return;

        const actKey = getPredictorActKey(act);
        const resolvedSource = new URL(source, window.location.href).href;
        if (predictorPlayingKey === actKey && audioPlayer.src === resolvedSource && !audioPlayer.paused) {
            stopPredictorSnippet();
            return;
        }

        const playId = ++predictorSnippetPlayId;
        predictorPlayingKey = actKey;
        renderPredictor();
        try {
            audioPlayer.pause();
            audioPlayer.muted = audioMuted;
            if (audioPlayer.src !== resolvedSource) {
                audioPlayer.src = resolvedSource;
                audioPlayer.load();
            }
            audioPlayer.currentTime = 0;
            await audioPlayer.play();
        } catch (err) {
            if (playId === predictorSnippetPlayId && err.name !== 'AbortError') {
                console.warn('Predictor snippet playback failed', err);
                predictorPlayingKey = null;
                renderPredictor();
            }
        }
    }

    function stopPredictorSnippet() {
        if (!predictorPlayingKey) return;
        predictorSnippetPlayId += 1;
        predictorPlayingKey = null;
        if (audioPlayer && !audioPlayer.paused) {
            audioPlayer.pause();
        }
        renderPredictor();
    }

    function isPredictorActPlaying(act) {
        return Boolean(predictorPlayingKey && getPredictorActKey(act) === predictorPlayingKey);
    }

    function getPredictorActKey(act) {
        return `${act.country || ''}|${act.artist || ''}|${act.title || ''}`;
    }

    function resolvePredictorActAudio(act) {
        if (act.audio) return act.audio;
        const byTitleArtist = allSongs.find(song =>
            String(song.year) === '2026' &&
            song.country === act.country &&
            song.title === act.title &&
            song.artist === act.artist
        );
        if (byTitleArtist) return byTitleArtist.audio;
        const byCountry = allSongs.find(song =>
            String(song.year) === '2026' &&
            song.country === act.country
        );
        return byCountry ? byCountry.audio : null;
    }

    function calculatePredictorScore() {
        if (!predictorConfig || !predictorState) return;
        const results = predictorConfig.results || {};
        const semi1Score = scoreSemiQualificationBoard(predictorState.semi1, predictorConfig.semi1Acts || [], results.semi1 || []);
        const semi2Score = scoreSemiQualificationBoard(predictorState.semi2, predictorConfig.semi2Acts || [], results.semi2 || []);
        const finalScore = scoreFinalRankingBoard(predictorState.final, results.final || []);
        const total = semi1Score.points + semi2Score.points + finalScore.points;

        const totalEl = document.getElementById('predictor-score-total');
        const breakdownEl = document.getElementById('predictor-score-breakdown');
        if (totalEl) totalEl.textContent = `Total points: ${total}`;
        if (breakdownEl) {
            breakdownEl.textContent = `Semi 1 calls: ${semi1Score.points}/${semi1Score.max} | Semi 2 calls: ${semi2Score.points}/${semi2Score.max} | Final ranking: ${finalScore.points}`;
        }
    }

    function scoreSemiQualificationBoard(picks, acts, actualResults) {
        if (!actualResults || actualResults.length === 0) {
            return { points: 0, max: acts.length };
        }
        const actualQualifiers = new Set(actualResults.map(result => typeof result === 'string' ? result : result.country));
        let points = 0;
        acts.forEach(act => {
            if (!picks || typeof picks[act.country] !== 'boolean') return;
            const actuallyQualified = actualQualifiers.has(act.country);
            if (picks[act.country] === actuallyQualified) points += 1;
        });
        return { points, max: acts.length };
    }

    function scoreFinalRankingBoard(picks, actualResults) {
        if (!actualResults || actualResults.length === 0) {
            return { points: 0 };
        }
        const actualMap = new Map(actualResults.map((act, idx) => [typeof act === 'string' ? act : act.country, idx]));
        let points = 0;
        picks.forEach((pick, idx) => {
            if (!pick || !actualMap.has(pick.country)) return;
            const diff = Math.abs(idx - actualMap.get(pick.country));
            if (diff === 0) points += 12;
            else if (diff === 1) points += 9;
            else if (diff === 2) points += 6;
            else if (diff === 3) points += 3;
        });
        return { points };
    }

    function updateTopNav(viewName) {
        const topNav = document.getElementById('top-nav');
        if (!topNav) return;
        topNav.querySelectorAll('.nav-pill').forEach(btn => {
            const target = btn.dataset.view || 'menu';
            const isActive =
                (viewName === 'home' && target === 'home') ||
                (viewName === 'prediction' && target === 'prediction') ||
                (viewName === 'prediction-rules' && target === 'prediction-rules') ||
                (viewName === 'leaderboard' && target === 'leaderboard') ||
                (viewName === 'menu' && target === 'menu');
            btn.classList.toggle('active', isActive);
        });
    }

    // --- Shared Helpers ---
    function pickRandomSong(list) {
        if (list.length === 0) return null;
        const index = Math.floor(randomGenerator() * list.length);
        return list[index];
    }

    // --- Leaderboard ---
    async function showLeaderboard(mode = 'prediction') {
        showView('leaderboard');
        const list = leaderboardList || document.getElementById('leaderboard-list');
        if (!list) return;

        updateLeaderboardTabs(mode);
        list.innerHTML = 'Loading...';

        try {
            const entries = mode === 'prediction'
                ? await fetchPredictionLeaderboard()
                : await fetchGameLeaderboard(mode);
            renderLeaderboardEntries(list, entries, mode);
        } catch (err) {
            list.innerHTML = 'Error loading leaderboard.';
            console.error(err);
        }
    }

    function updateLeaderboardTabs(mode) {
        if (!leaderboardTabs) return;
        leaderboardTabs.querySelectorAll('.leaderboard-tab').forEach(btn => {
            btn.classList.toggle('active', (btn.dataset.mode || '') === mode);
        });
    }

    async function fetchPredictionLeaderboard() {
        const response = await fetch('/api/predictions');
        if (!response.ok) throw new Error(await response.text());
        return response.json();
    }

    async function fetchGameLeaderboard(mode) {
        const response = await fetch('/api/leaderboard');
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        return (data || []).filter(entry => entry.mode === mode);
    }

    function renderLeaderboardEntries(list, entries, mode) {
        list.innerHTML = '';
        if (!entries || entries.length === 0) {
            list.innerHTML = `<p>No scores yet for ${getLeaderboardModeLabel(mode)}.</p>`;
            return;
        }

        entries.forEach((entry, i) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            const score = mode === 'prediction'
                ? entry.score?.total ?? 0
                : entry.score ?? 0;
            const meta = mode === 'prediction'
                ? formatPredictionScoreMeta(entry.score)
                : getLeaderboardModeLabel(entry.mode);
            const rank = document.createElement('span');
            rank.className = 'rank';
            rank.textContent = `#${i + 1}`;
            const nameWrap = document.createElement('span');
            const name = document.createElement('strong');
            name.textContent = entry.name || 'Anonymous';
            const metaEl = document.createElement('small');
            metaEl.textContent = meta;
            const scoreEl = document.createElement('span');
            scoreEl.className = 'score';
            scoreEl.textContent = String(score);
            const scoreWrap = document.createElement('span');
            scoreWrap.className = 'score-wrap';
            scoreWrap.append(scoreEl);
            if (mode === 'prediction') {
                const picksToggle = document.createElement('button');
                picksToggle.className = 'leaderboard-picks-toggle';
                picksToggle.type = 'button';
                picksToggle.textContent = 'View picks';
                picksToggle.onclick = () => item.classList.toggle('show-picks');
                scoreWrap.append(picksToggle);
            }

            nameWrap.append(name, metaEl);
            item.append(rank, nameWrap, scoreWrap);
            if (mode === 'prediction') {
                item.appendChild(buildPredictionPicksPanel(entry));
            }
            list.appendChild(item);
        });
    }

    function buildPredictionPicksPanel(entry) {
        const panel = document.createElement('div');
        panel.className = 'prediction-picks-panel';
        const picks = entry.picks || {};
        panel.append(
            buildPredictionPickLine('Semi 1 Q', getPickedCountries(picks.semi1, true)),
            buildPredictionPickLine('Semi 2 Q', getPickedCountries(picks.semi2, true)),
            buildPredictionPickLine('Final top 10', getFinalPickedCountries(picks.final))
        );
        return panel;
    }

    function buildPredictionPickLine(label, countries) {
        const row = document.createElement('p');
        const strong = document.createElement('strong');
        const span = document.createElement('span');
        strong.textContent = label;
        span.textContent = countries.length ? countries.join(', ') : 'No picks yet';
        row.append(strong, span);
        return row;
    }

    function getPickedCountries(board, value) {
        if (!board || typeof board !== 'object') return [];
        return Object.entries(board)
            .filter(([, pick]) => pick === value)
            .map(([country]) => country);
    }

    function getFinalPickedCountries(finalPicks) {
        if (!Array.isArray(finalPicks)) return [];
        return finalPicks
            .filter(Boolean)
            .map(pick => typeof pick === 'string' ? pick : pick.country)
            .filter(Boolean);
    }

    function getLeaderboardModeLabel(mode) {
        const labels = {
            prediction: 'ESC Predictor',
            timeline: 'Timeline Mode',
            country: 'Country Mode',
            'esc2026-country': 'ESC 2026 Country Quiz'
        };
        return labels[mode] || mode || 'Unknown mode';
    }

    function formatPredictionScoreMeta(score) {
        if (!score) return 'Server scored';
        return `Semi 1 ${score.semi1?.points ?? 0}/${score.semi1?.max ?? 0} | Semi 2 ${score.semi2?.points ?? 0}/${score.semi2?.max ?? 0} | Final ${score.final?.points ?? 0}`;
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
                showLeaderboard(currentMode || 'timeline');
                gameOverModal.classList.add('hidden');
            })
            .catch(err => {
                console.error('Leaderboard save failed', err);
                alert(err.message || "Failed to save score. Check your connection and try again.");
            });
    }
});
