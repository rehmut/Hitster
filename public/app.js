document.addEventListener('DOMContentLoaded', () => {
    // Global State
    let allSongs = [];
    let currentMode = null; // 'timeline' or 'country'
    let score = 0;
    let lives = 3;
    let isPlaying = false;
    let currentSong = null;

    // DOM Elements
    const views = {
        menu: document.getElementById('view-menu'),
        timeline: document.getElementById('view-timeline'),
        country: document.getElementById('view-country'),
        leaderboard: document.getElementById('view-leaderboard')
    };

    const audioPlayer = document.getElementById('audio-player');
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const statsEl = document.getElementById('game-stats');
    const gameOverModal = document.getElementById('game-over-modal');
    const finalScoreEl = document.getElementById('final-score');
    const playerNameInput = document.getElementById('player-name');

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

    const leaderboardBtn = document.getElementById('btn-view-leaderboard');
    if (leaderboardBtn) leaderboardBtn.onclick = () => showLeaderboard();

    const backMenuBtns = document.querySelectorAll('#btn-quit-timeline, #btn-quit-country, #btn-back-menu');
    backMenuBtns.forEach(btn => {
        btn.onclick = () => showView('menu');
    });

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
        views[viewName].classList.remove('hidden');

        if (viewName === 'menu' || viewName === 'leaderboard') {
            statsEl.classList.add('hidden');
            isPlaying = false;
            btn.textContent = "▶ Play Snippet";
            cardEl.classList.remove('playing');
        } else {
            // Autoplay only for Timeline mode (or if preferred)
            // User requested NO autoplay for Country Mode
            if (currentMode !== 'country' && audioPlayer.src) {
                audioPlayer.play()
                    .then(() => {
                        isPlaying = true;
                        btn.textContent = "⏸ Pause";
                        cardEl.classList.add('playing');
                    })
                    .catch(e => console.error("Playback failed:", e));
            }
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
    function startGame(mode) {
        currentMode = mode;
        score = 0;
        lives = 3;
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
    }

    function endGame() {
        stopAudio();
        finalScoreEl.textContent = score;
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
            alert(`Correct! ${currentSong.year}`);
        } else {
            lives--;
            alert(`Wrong! It was ${currentSong.year}`);
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
        setTimeout(nextTimelineTurn, 2000);
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
                setTimeout(nextCountryTurn, 1500);
            }, 1500);
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
                setTimeout(nextCountryTurn, 1500);
            }
        }
    }

    // --- Shared Helpers ---
    function pickRandomSong(list) {
        if (list.length === 0) return null;
        const index = Math.floor(Math.random() * list.length);
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
            .then(res => res.json())
            .then(() => {
                alert("Score Saved!");
                showLeaderboard();
                gameOverModal.classList.add('hidden');
            })
            .catch(err => alert("Failed to save score."));
    }
});
