(() => {
  'use strict';

  // Simple utility helpers
  const byId = (id) => document.getElementById(id);
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // UI Elements
  const screenMenu = byId('screen-menu');
  const screenGame = byId('screen-game');
  const gymEl = byId('gym');
  const btnPlay = byId('btn-play');
  const btnHow = byId('btn-how');
  const btnSettings = byId('btn-settings');
  const btnCredits = byId('btn-credits');
  const panelHow = byId('panel-how');
  const panelSettings = byId('panel-settings');
  const panelCredits = byId('panel-credits');
  const bigTimer = byId('big-timer');
  const accuracyEl = byId('accuracy');
  const scoreEl = byId('score');
  const completedEl = byId('completed');
  const totalEl = byId('total');
  const gymClock = byId('gym-clock');
  const overlayPause = byId('overlay-pause');
  const overlayEnd = byId('overlay-end');
  const endTitle = byId('end-title');
  const endStats = byId('end-stats');
  const btnPause = byId('btn-pause');
  const btnResume = byId('btn-resume');
  const btnRestart = byId('btn-restart');
  const btnExit = byId('btn-exit');
  const btnPlayAgain = byId('btn-play-again');
  const btnExit2 = byId('btn-exit-2');
  const toast = byId('toast');
  const musicVolumeInput = byId('musicVolume');
  const sfxVolumeInput = byId('sfxVolume');
  const highContrastInput = byId('highContrast');

  // Game configuration
  const MAX_TARGET_SECONDS = 60; // 1 minute max
  const MIN_TARGET_SECONDS = 6;  // 6 seconds min to keep it snappy
  const EQUIPMENT_LIST = [
    { name: 'Dumbbell', icon: '🏋️' },
    { name: 'Treadmill', icon: '🏃' },
    { name: 'Kettlebell', icon: '🏋️‍♀️' },
    { name: 'Rowing', icon: '🚣' },
    { name: 'Bench', icon: '🪑' },
    { name: 'Jump Rope', icon: '🪢' },
    { name: 'Medicine Ball', icon: '🏐' },
    { name: 'Bike', icon: '🚴' },
  ];

  // High Score System
  const HighScores = (() => {
    const STORAGE_KEY = 'gym-grip-highscores';
    
    function get() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    }
    
    function set(scores) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
      } catch {
        // Silently fail if localStorage is not available
      }
    }
    
    function update(equipmentName, score, accuracy) {
      const scores = get();
      if (!scores[equipmentName] || score > scores[equipmentName].score) {
        scores[equipmentName] = { score, accuracy, date: new Date().toISOString() };
        set(scores);
        return true; // New high score
      }
      return false; // Not a high score
    }
    
    function getForEquipment(equipmentName) {
      return get()[equipmentName] || null;
    }
    
    function getAll() {
      return get();
    }
    
    return { get, set, update, getForEquipment, getAll };
  })();

  // Mobile detection and touch handling
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Audio: lightweight synth using WebAudio API
  const AudioEngine = (() => {
    let ctx;
    let masterGain;
    let musicGain;
    let sfxGain;
    let musicTimer = null;
    let stepIndex = 0;
    let currentSongIndex = 0;
    let stepsInCurrentSong = 0;

    // Simple set of loopable songs (relative semitone steps)
    const SONGS = [
      { base: 220, tempo: 96, seq: [0, 3, 7, 10, 12, 10, 7, 3] },
      { base: 196, tempo: 88, seq: [0, 5, 9, 12, 9, 5, 0, -3] },
      { base: 247, tempo: 110, seq: [0, 2, 4, 7, 9, 7, 4, 2] },
      { base: 233, tempo: 102, seq: [0, 7, 10, 14, 10, 7, 0, -5] },
    ];

    let currentMode = 'none'; // 'none' | 'game'

    function ensure() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.9;
        masterGain.connect(ctx.destination);
        musicGain = ctx.createGain();
        musicGain.gain.value = parseFloat(musicVolumeInput.value || '0.5');
        musicGain.connect(masterGain);
        sfxGain = ctx.createGain();
        sfxGain.gain.value = parseFloat(sfxVolumeInput.value || '0.8');
        sfxGain.connect(masterGain);
      }
    }

    function resume() { 
      try { 
        ensure(); 
        if (ctx.state === 'suspended') {
          return ctx.resume(); 
        }
      } catch { /* noop */ } 
    }
    function suspend() { try { return ctx.suspend(); } catch { /* noop */ } }

    function setMusicVol(v){ ensure(); musicGain.gain.value = v }
    function setSfxVol(v){ ensure(); sfxGain.gain.value = v }

    function playTone(freq = 440, duration = 0.12, type = 'sine', gain = 0.2) {
      try {
        ensure();
        if (ctx.state !== 'running') return;
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = type;
        gainNode.gain.value = gain * sfxGain.gain.value;
        osc.connect(gainNode);
        gainNode.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + duration);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      } catch { /* noop */ }
    }

    function playMusicNote(freq = 440, duration = 0.25, type = 'sine', gain = 0.06){
      try {
        ensure();
        if (ctx.state !== 'running') return;
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = type;
        gainNode.gain.value = gain * musicGain.gain.value;
        osc.connect(gainNode);
        gainNode.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + duration);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      } catch { /* noop */ }
    }

    function playSuccess(){ playTone(740, 0.12, 'triangle', 0.25); setTimeout(()=>playTone(880,0.12,'triangle',0.22), 90) }
    function playFail(){ playTone(180, 0.25, 'sawtooth', 0.2) }
    function playClick(){ playTone(520, 0.06, 'square', 0.12) }
    function playHighScore(){ playTone(880, 0.15, 'triangle', 0.3); setTimeout(()=>playTone(1100,0.15,'triangle',0.28), 100); setTimeout(()=>playTone(1320,0.2,'triangle',0.25), 200) }

    function startSong(index){
      if (musicTimer) clearInterval(musicTimer);
      const song = SONGS[index];
      if (!song) return;
      currentSongIndex = index;
      stepIndex = 0;
      stepsInCurrentSong = song.seq.length;
      const stepTime = 60 / song.tempo;
      musicTimer = setInterval(() => {
        if (currentMode !== 'game') return;
        const note = song.seq[stepIndex];
        const freq = song.base * Math.pow(2, note / 12);
        playMusicNote(freq, stepTime * 0.8, 'sine', 0.06);
        stepIndex = (stepIndex + 1) % stepsInCurrentSong;
      }, stepTime * 1000);
    }

    function startGameMusic(){
      currentMode = 'game';
      startSong(Math.floor(Math.random() * SONGS.length));
    }

    function stopAllMusic(){
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
      currentMode = 'none';
    }

    function stopMusic(){
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    }

    return { ensure, resume, suspend, setMusicVol, setSfxVol, playTone, playSuccess, playFail, playClick, playHighScore, startGameMusic, stopAllMusic, stopMusic };
  })();

  function showToast(message, mood='info'){
    toast.textContent = message;
    toast.className = `toast ${mood}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  const rnd = (min, max) => Math.random()*(max-min)+min;

  function equipmentSVG(name){
    // Equipment-specific SVG graphics
    const graphics = {
      'Dumbbell': `<svg viewBox="0 0 100 100" class="graphic">
        <rect x="35" y="20" width="30" height="60" rx="15" fill="#c1f5ff"/>
        <rect x="25" y="15" width="50" height="70" rx="20" fill="none" stroke="#00a3ff" stroke-width="3"/>
        <circle cx="50" cy="25" r="8" fill="#38d39f"/>
        <circle cx="50" cy="75" r="8" fill="#38d39f"/>
      </svg>`,
      'Treadmill': `<svg viewBox="0 0 100 100" class="graphic">
        <rect x="20" y="40" width="60" height="20" rx="10" fill="#c1f5ff"/>
        <rect x="15" y="35" width="70" height="30" rx="15" fill="none" stroke="#00a3ff" stroke-width="3"/>
        <circle cx="30" cy="50" r="6" fill="#38d39f"/>
        <circle cx="70" cy="50" r="6" fill="#38d39f"/>
        <line x1="25" y1="50" x2="75" y2="50" stroke="#00a3ff" stroke-width="2" stroke-dasharray="5,5"/>
      </svg>`,
      'Kettlebell': `<svg viewBox="0 0 100 100" class="graphic">
        <circle cx="50" cy="60" r="25" fill="#c1f5ff"/>
        <rect x="45" y="20" width="10" height="25" rx="5" fill="#38d39f"/>
        <rect x="40" y="15" width="20" height="35" rx="10" fill="none" stroke="#00a3ff" stroke-width="3"/>
        <circle cx="50" cy="25" r="8" fill="#38d39f"/>
      </svg>`,
      'Rowing': `<svg viewBox="0 0 100 100" class="graphic">
        <rect x="30" y="30" width="40" height="40" rx="20" fill="#c1f5ff"/>
        <rect x="25" y="25" width="50" height="50" rx="25" fill="none" stroke="#00a3ff" stroke-width="3"/>
        <line x1="20" y1="50" x2="80" y2="50" stroke="#38d39f" stroke-width="4"/>
        <circle cx="35" cy="50" r="4" fill="#38d39f"/>
        <circle cx="65" cy="50" r="4" fill="#38d39f"/>
      </svg>`,
      'Bench': `<svg viewBox="0 0 100 100" class="graphic">
        <rect x="20" y="50" width="60" height="15" rx="7" fill="#c1f5ff"/>
        <rect x="15" y="45" width="70" height="25" rx="12" fill="none" stroke="#00a3ff" stroke-width="3"/>
        <rect x="25" y="35" width="50" height="8" rx="4" fill="#38d39f"/>
        <rect x="20" y="30" width="60" height="18" rx="9" fill="none" stroke="#00a3ff" stroke-width="2"/>
      </svg>`,
      'Jump Rope': `<svg viewBox="0 0 100 100" class="graphic">
        <path d="M 20 30 Q 50 10 80 30 Q 50 50 20 30" fill="none" stroke="#c1f5ff" stroke-width="3"/>
        <path d="M 15 25 Q 50 5 85 25 Q 50 45 15 25" fill="none" stroke="#00a3ff" stroke-width="2"/>
        <circle cx="20" cy="30" r="4" fill="#38d39f"/>
        <circle cx="80" cy="30" r="4" fill="#38d39f"/>
        <line x1="20" y1="30" x2="20" y2="70" stroke="#38d39f" stroke-width="2"/>
        <line x1="80" y1="30" x2="80" y2="70" stroke="#38d39f" stroke-width="2"/>
      </svg>`,
      'Medicine Ball': `<svg viewBox="0 0 100 100" class="graphic">
        <circle cx="50" cy="50" r="30" fill="#c1f5ff"/>
        <circle cx="50" cy="50" r="35" fill="none" stroke="#00a3ff" stroke-width="3"/>
        <path d="M 30 50 Q 50 30 70 50 Q 50 70 30 50" fill="#38d39f" opacity="0.7"/>
        <path d="M 50 30 Q 70 50 50 70 Q 30 50 50 30" fill="#38d39f" opacity="0.7"/>
      </svg>`,
      'Bike': `<svg viewBox="0 0 100 100" class="graphic">
        <circle cx="35" cy="60" r="15" fill="#c1f5ff"/>
        <circle cx="65" cy="60" r="15" fill="#c1f5ff"/>
        <circle cx="33" cy="58" r="17" fill="none" stroke="#00a3ff" stroke-width="3"/>
        <circle cx="63" cy="58" r="17" fill="none" stroke="#00a3ff" stroke-width="3"/>
        <rect x="45" y="30" width="10" height="25" rx="5" fill="#38d39f"/>
        <rect x="43" y="28" width="14" height="29" rx="7" fill="none" stroke="#00a3ff" stroke-width="2"/>
        <line x1="50" y1="35" x2="50" y2="45" stroke="#00a3ff" stroke-width="2"/>
      </svg>`
    };
    return graphics[name] || `<div class="icon" style="font-size:32px">🏋️</div>`;
  }

  let state = {
    playing: false,
    paused: false,
    equipments: [],
    holds: new Map(), // id -> { start, targetSeconds, completed, elem }
    score: 0,
    completed: 0,
    targetCount: 0,
    currentId: null,
  };

  // Generate equipment positions within the gym area
  function layoutEquipments(){
    const rect = gymEl.getBoundingClientRect();
    const width = rect.width; const height = rect.height;
    const pad = isMobile ? 20 : 30; 
    const size = isMobile ? 90 : 120; // Smaller equipment on mobile
    const positions = [];
    for (let i=0;i<state.targetCount;i++){
      let attempts = 0; let placed = false; let x=0,y=0;
      while(!placed && attempts<200){
        x = rnd(pad, width - size - pad);
        y = rnd(pad, height - size - pad);
        placed = positions.every(p => Math.hypot(p.x - x, p.y - y) > size*1.1);
        attempts++;
      }
      positions.push({x,y});
    }
    return positions;
  }

  // Create equipment DOM
  function createEquipments(){
    gymEl.innerHTML = '';
    state.holds.clear();
    state.equipments = [];
    const positions = layoutEquipments();
    const list = [...EQUIPMENT_LIST];
    while (list.length < state.targetCount) list.push(...EQUIPMENT_LIST);
    for (let i=0;i<state.targetCount;i++){
      const id = `eq-${i}`;
      const data = list[i % list.length];
      const targetSeconds = Math.round(rnd(MIN_TARGET_SECONDS, MAX_TARGET_SECONDS));
      const el = document.createElement('div');
      el.className = 'equipment';
      el.setAttribute('data-id', id);
      
      // Get high score for this equipment
      const highScore = HighScores.getForEquipment(data.name);
      const highScoreText = highScore ? `Best: ${highScore.score}pts` : '';
      
      el.innerHTML = `
        <div class="progress-ring"></div>
        <div class="content">
          ${equipmentSVG(data.name)}
          <div class="name">${data.name}</div>
          <div class="target">Hold: ${targetSeconds}s</div>
          ${highScoreText ? `<div class="high-score">${highScoreText}</div>` : ''}
        </div>`;
      el.style.left = `${positions[i].x}px`;
      el.style.top  = `${positions[i].y}px`;
      el.style.setProperty('--deg', '0deg');
      gymEl.appendChild(el);
      state.holds.set(id, { start: null, targetSeconds, completed:false, elem: el, name: data.name });
      state.equipments.push(el);
    }
    totalEl.textContent = String(state.targetCount);
    completedEl.textContent = '0';
  }

  // Hold logic
  function onHoldStart(el){
    const id = el.getAttribute('data-id');
    const info = state.holds.get(id);
    if (!info || info.completed || state.paused) return;
    state.currentId = id;
    info.start = performance.now();
    el.classList.add('held');
    bigTimer.textContent = `Holding ${info.name}... 0.0s / ${info.targetSeconds}s`;
    accuracyEl.textContent = '';
    qs('.progress-ring', el).classList.remove('fill');
    AudioEngine.playClick();
  }
  
  function onHoldEnd(el, canceled=false){
    const id = el.getAttribute('data-id');
    const info = state.holds.get(id);
    if (!info || info.completed) return;
    el.classList.remove('held');
    if (!info.start){
      // released without starting; playful hint
      showToast('Coach: You gotta hold it, not just pat it!', 'info');
      return;
    }
    const elapsed = (performance.now() - info.start)/1000;
    const delta = Math.abs(elapsed - info.targetSeconds);
    const within = elapsed >= info.targetSeconds;
    const pct = Math.max(0, Math.min(1, elapsed / info.targetSeconds));
    if (within){
      info.completed = true;
      el.classList.add('done');
      qs('.progress-ring', el).classList.add('fill');
      const gained = Math.max(5, Math.round(100 * (1 - Math.min(1, delta / 3))));
      state.score += gained;
      
      // Check for high score
      const accuracy = Math.max(0, Math.round(100 * (1 - Math.min(1, delta / 2))));
      const isNewHighScore = HighScores.update(info.name, gained, accuracy);
      
      if (isNewHighScore) {
        AudioEngine.playHighScore();
        showToast(`🏆 NEW HIGH SCORE for ${info.name}! +${gained} pts`, 'good');
      } else {
        AudioEngine.playSuccess();
        showToast(`Nailed it! +${gained} pts (off by ${delta.toFixed(1)}s)`, 'good');
      }
      
      state.completed++;
      completedEl.textContent = String(state.completed);
      scoreEl.textContent = String(state.score);
      bigTimer.textContent = 'Pick another equipment';
      accuracyEl.textContent = '';
      el.classList.add('disabled');
      
      // Update the equipment display to show new high score
      const highScoreText = `Best: ${gained}pts`;
      const highScoreEl = qs('.high-score', el);
      if (highScoreEl) {
        highScoreEl.textContent = highScoreText;
      } else {
        const content = qs('.content', el);
        const newHighScoreEl = document.createElement('div');
        newHighScoreEl.className = 'high-score';
        newHighScoreEl.textContent = highScoreText;
        content.appendChild(newHighScoreEl);
      }
      
      if (state.completed >= state.targetCount){
        endGame(true);
      }
    } else {
      AudioEngine.playFail();
      // funny fail
      if (canceled){
        showToast('Coach: Stay in the zone! The weights are shy.', 'bad');
      } else {
        showToast(`Coach: Slipped at ${elapsed.toFixed(1)}s. Grip like you mean it!`, 'bad');
      }
      // clear progress ring on release when not completed
      const ring = qs('.progress-ring', el);
      ring.style.setProperty('--deg', '0deg');
      ring.classList.remove('fill');
      bigTimer.textContent = `Hold longer! ${elapsed.toFixed(1)}s / ${info.targetSeconds}s`;
      accuracyEl.textContent = `Tip: Aim to release after ${info.targetSeconds}s`;
    }
    info.start = null;
    state.currentId = null;
  }

  function attachEquipmentEvents(el){
    // Enhanced touch handling for mobile
    if (isTouchDevice) {
      // Touch events with better mobile handling
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onHoldStart(el);
      }, { passive: false });
      
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.currentId === el.getAttribute('data-id')) {
          onHoldEnd(el);
        }
      }, { passive: false });
      
      el.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.currentId === el.getAttribute('data-id')) {
          onHoldEnd(el, true);
        }
      }, { passive: false });
      
      // Prevent scrolling when touching equipment
      el.addEventListener('touchmove', (e) => {
        e.preventDefault();
      }, { passive: false });
    }
    
    // Mouse events for desktop
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onHoldStart(el);
    });
    
    window.addEventListener('mouseup', (e) => {
      if (state.currentId === el.getAttribute('data-id')) {
        onHoldEnd(el);
      }
    });
    
    // Leave area cancels
    el.addEventListener('mouseleave', () => {
      if (state.currentId === el.getAttribute('data-id')) {
        onHoldEnd(el, true);
      }
    });
  }

  function updateHeldVisual(now){
    if (!state.currentId) return;
    const info = state.holds.get(state.currentId);
    if (!info || !info.start) return;
    const el = info.elem;
    const elapsed = Math.max(0, (now - info.start)/1000);
    const pct = Math.max(0, Math.min(1, elapsed / info.targetSeconds));
    bigTimer.textContent = `Holding ${info.name}... ${elapsed.toFixed(1)}s / ${info.targetSeconds}s`;
    const ring = qs('.progress-ring', el);
    const deg = Math.floor(pct * 360);
    ring.style.setProperty('--deg', `${deg}deg`);
    ring.classList.toggle('fill', pct >= 1);
  }

  let rafId;
  function loop(t){
    if (!state.playing || state.paused){ rafId = requestAnimationFrame(loop); return; }
    updateHeldVisual(performance.now());
    // update wall clock
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const ss = String(now.getSeconds()).padStart(2,'0');
    gymClock.textContent = `${hh}:${mm}:${ss}`;
    rafId = requestAnimationFrame(loop);
  }

  function startGame(){
    // init
    state.playing = true; state.paused = false; state.score = 0; state.completed = 0; state.currentId = null;
    scoreEl.textContent = '0'; completedEl.textContent = '0';
    bigTimer.textContent = 'Pick an equipment';
    accuracyEl.textContent = '';
    // show game screen before layout so sizes are correct
    screenMenu.classList.remove('active'); screenMenu.setAttribute('aria-hidden','true');
    screenGame.classList.add('active'); screenGame.setAttribute('aria-hidden','false');
    // difficulty: 6-10 equipments
    state.targetCount = Math.floor(rnd(6, 10));
    createEquipments();
    state.equipments.forEach(attachEquipmentEvents);
    
    // Handle audio context more gracefully to avoid noise
    AudioEngine.stopAllMusic(); // Stop any existing music first
    setTimeout(() => {
      AudioEngine.resume(); // Resume audio context after a delay
      setTimeout(() => {
        AudioEngine.startGameMusic(); // Start game music after context is resumed
      }, 50);
    }, 100);
    
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function endGame(won){
    state.playing = false;
    overlayEnd.classList.remove('hidden'); overlayEnd.setAttribute('aria-hidden','false');
    endTitle.textContent = won ? 'Champion Grip!' : 'Good Hustle!';
    
    // Show high scores summary
    const highScores = HighScores.getAll();
    const highScoreCount = Object.keys(highScores).length;
    let statsText = `Score: ${state.score} | Completed: ${state.completed}/${state.targetCount}`;
    if (highScoreCount > 0) {
      statsText += ` | High Scores: ${highScoreCount} equipment types`;
    }
    endStats.textContent = statsText;
    
    AudioEngine.playSuccess();
  }

  function pauseGame(){ if (!state.playing || state.paused) return; state.paused = true; overlayPause.classList.remove('hidden'); overlayPause.setAttribute('aria-hidden','false'); AudioEngine.suspend(); showToast('Paused. Hydration break!', 'info'); }
  function resumeGame(){ if (!state.paused) return; state.paused = false; overlayPause.classList.add('hidden'); overlayPause.setAttribute('aria-hidden','true'); AudioEngine.resume(); showToast('Back to the grind!', 'good'); }

  function backToMenu(){
    overlayPause.classList.add('hidden'); overlayEnd.classList.add('hidden');
    overlayPause.setAttribute('aria-hidden','true'); overlayEnd.setAttribute('aria-hidden','true');
    screenGame.classList.remove('active'); screenGame.setAttribute('aria-hidden','true');
    screenMenu.classList.add('active'); screenMenu.setAttribute('aria-hidden','false');
    AudioEngine.stopAllMusic(); // Ensure no overlap
    showToast('Coach: Strategy time at the menu.', 'info');
  }

  // Funny global error handling that keeps the game running
  window.addEventListener('error', (e)=>{
    console.warn('Game error:', e.error || e.message);
    showToast('Coach: That was a fancy move! Let\'s call it a feature.', 'bad');
    e.preventDefault();
  });
  window.addEventListener('unhandledrejection', (e)=>{
    console.warn('Unhandled rejection:', e.reason);
    showToast('Coach: That promise skipped leg day.', 'bad');
    e.preventDefault();
  });

  // Buttons
  btnPlay.addEventListener('click', startGame);
  btnHow.addEventListener('click', ()=>{ panelHow.classList.toggle('hidden'); });
  btnSettings.addEventListener('click', ()=>{ panelSettings.classList.toggle('hidden'); });
  btnCredits.addEventListener('click', ()=>{ panelCredits.classList.toggle('hidden'); });
  qsa('[data-close-panel]').forEach(btn=> btn.addEventListener('click', (e)=> e.target.closest('.panel').classList.add('hidden')));

  btnPause.addEventListener('click', ()=> state.paused ? resumeGame() : pauseGame());
  btnResume.addEventListener('click', resumeGame);
  btnRestart.addEventListener('click', ()=>{ overlayPause.classList.add('hidden'); overlayPause.setAttribute('aria-hidden','true'); startGame(); });
  btnExit.addEventListener('click', backToMenu);
  btnPlayAgain.addEventListener('click', ()=>{ overlayEnd.classList.add('hidden'); overlayEnd.setAttribute('aria-hidden','true'); startGame(); });
  btnExit2.addEventListener('click', backToMenu);

  // Keyboard controls
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p'){
      if (state.playing) state.paused ? resumeGame() : pauseGame();
    }
  });

  // Settings
  musicVolumeInput.addEventListener('input', (e)=> AudioEngine.setMusicVol(parseFloat(e.target.value)));
  sfxVolumeInput.addEventListener('input', (e)=> AudioEngine.setSfxVol(parseFloat(e.target.value)));
  highContrastInput.addEventListener('change', (e)=>{
    document.documentElement.classList.toggle('high-contrast', e.target.checked);
  });

  // Resize relayout on show
  window.addEventListener('resize', () => { if (state.playing){ createEquipments(); state.equipments.forEach(attachEquipmentEvents); } });

  // Accessibility: prevent context menu interfering with hold
  window.addEventListener('contextmenu', (e)=>{
    if (state.playing) e.preventDefault();
  });

  // Mobile-specific optimizations
  if (isMobile) {
    // Prevent zoom on double tap
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = (new Date()).getTime();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, false);
    
    // Prevent pull-to-refresh on mobile
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });
  }

})();


