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

  // Game configuration - REDUCED TIMES FOR BETTER MOBILE EXPERIENCE
  const MAX_TARGET_SECONDS = 8;  // Reduced from 60 to 8 seconds max
  const MIN_TARGET_SECONDS = 2;  // Reduced from 6 to 2 seconds min
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

  // Game state
  const state = {
    playing: false,
    paused: false,
    score: 0,
    completed: 0,
    targetCount: 0,
    currentId: null,
    holds: new Map(),
    equipments: [],
    lastLayoutTime: 0,
    layoutDebounceId: null
  };

  // Audio Engine
  const AudioEngine = (() => {
    let ctx, musicGain, sfxGain, musicSource;
    
    function ensure() {
      if (ctx) return;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        musicGain = ctx.createGain();
        sfxGain = ctx.createGain();
        musicGain.connect(ctx.destination);
        sfxGain.connect(ctx.destination);
        musicGain.gain.value = 0.3;
        sfxGain.gain.value = 0.4;
      } catch (e) {
        console.warn('Audio not supported:', e);
      }
    }
    
    function resume() { 
      if (ctx && ctx.state === 'suspended') {
        try { ctx.resume(); } catch { /* noop */ }
      }
    }
    
    function suspend() { try { return ctx.suspend(); } catch { /* noop */ } }
    
    function setMusicVol(v){ ensure(); musicGain.gain.value = v }
    function setSfxVol(v){ ensure(); sfxGain.gain.value = v }
    
    function playTone(freq = 440, duration = 0.12, type = 'sine', gain = 0.2) {
      try {
        ensure();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = type;
        gainNode.gain.value = gain;
        osc.connect(gainNode);
        gainNode.connect(sfxGain);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (e) {
        // Silently fail if audio is not available
      }
    }
    
    function playMusicNote(freq = 440, duration = 0.25, type = 'sine', gain = 0.06){
      try {
        ensure();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = type;
        gainNode.gain.value = gain;
        osc.connect(gainNode);
        gainNode.connect(musicGain);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (e) {
        // Silently fail if audio is not available
      }
    }
    
    function playSuccess(){ playTone(740, 0.12, 'triangle', 0.25); setTimeout(()=>playTone(880,0.12,'triangle',0.22), 90) }
    function playFail(){ playTone(180, 0.25, 'sawtooth', 0.2) }
    function playClick(){ playTone(520, 0.06, 'square', 0.12) }
    function playHighScore(){ playTone(880, 0.15, 'triangle', 0.3); setTimeout(()=>playTone(1100,0.15,'triangle',0.28), 100); setTimeout(()=>playTone(1320,0.2,'triangle',0.25), 200) }
    
    function startSong(index){
      if (!ctx) return;
      const notes = [262, 330, 392, 523, 659, 784, 1047];
      const melody = [0,2,4,2,0,2,4,2,0,2,4,2,0,2,4,2];
      let i = 0;
      const playNext = () => {
        if (i < melody.length && state.playing && !state.paused) {
          playMusicNote(notes[melody[i]]);
          i++;
          setTimeout(playNext, 200);
        }
      };
      playNext();
    }
    
    function startGameMusic(){
      if (!ctx) return;
      startSong(0);
    }
    
    function stopAllMusic(){
      if (musicSource) {
        try { musicSource.stop(); } catch { /* noop */ }
        musicSource = null;
      }
    }
    
    function stopMusic(){
      stopAllMusic();
    }
    
    return { ensure, resume, suspend, setMusicVol, setSfxVol, playTone, playMusicNote, playSuccess, playFail, playClick, playHighScore, startSong, startGameMusic, stopAllMusic, stopMusic };
  })();

  function showToast(message, mood='info'){
    toast.textContent = message;
    toast.className = `toast ${mood}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  const rnd = (min, max) => Math.random()*(max-min)+min;

  function equipmentSVG(name){
    const graphics = {
      'Dumbbell': `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M12 8C13.1 8 14 8.9 14 10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10C10 8.9 10.9 8 12 8M12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14M12 20C13.1 20 14 20.9 14 22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22C10 20.9 10.9 20 12 20Z"/></svg>`,
      'Treadmill': `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M12 8C13.1 8 14 8.9 14 10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10C10 8.9 10.9 8 12 8M12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14M12 20C13.1 20 14 20.9 14 22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22C10 20.9 10.9 20 12 20Z"/></svg>`,
      'Kettlebell': `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M12 8C13.1 8 14 8.9 14 10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10C10 8.9 10.9 8 12 8M12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14M12 20C13.1 20 14 20.9 14 22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22C10 20.9 10.9 20 12 20Z"/></svg>`,
      'Rowing': `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M12 8C13.1 8 14 8.9 14 10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10C10 8.9 10.9 8 12 8M12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14M12 20C13.1 20 14 20.9 14 22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22C10 20.9 10.9 20 12 20Z"/></svg>`,
      'Bench': `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M12 8C13.1 8 14 8.9 14 10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10C10 8.9 10.9 8 12 8M12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14M12 20C13.1 20 14 20.9 14 22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22C10 20.9 10.9 20 12 20Z"/></svg>`,
      'Jump Rope': `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M12 8C13.1 8 14 8.9 14 10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10C10 8.9 10.9 8 12 8M12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14M12 20C13.1 20 14 20.9 14 22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22C10 20.9 10.9 20 12 20Z"/></svg>`,
      'Medicine Ball': `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M12 8C13.1 8 14 8.9 14 10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10C10 8.9 10.9 8 12 8M12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14M12 20C13.1 20 14 20.9 14 22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22C10 20.9 10.9 20 12 20Z"/></svg>`,
      'Bike': `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M12 8C13.1 8 14 8.9 14 10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10C10 8.9 10.9 8 12 8M12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14M12 20C13.1 20 14 20.9 14 22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22C10 20.9 10.9 20 12 20Z"/></svg>`
    };
    return graphics[name] || graphics['Dumbbell'];
  }

  // IMPROVED LAYOUT SYSTEM - Fixed positioning issues
  function layoutEquipments(){
    // Use offsetWidth/offsetHeight instead of getBoundingClientRect for more stable positioning
    const width = gymEl.offsetWidth;
    const height = gymEl.offsetHeight;
    
    // Better spacing for mobile
    const pad = isMobile ? 15 : 25; 
    const size = isMobile ? 85 : 110; // Slightly smaller for better mobile fit
    
    const positions = [];
    for (let i=0;i<state.targetCount;i++){
      let attempts = 0; let placed = false; let x=0,y=0;
      while(!placed && attempts<200){
        x = rnd(pad, width - size - pad);
        y = rnd(pad, height - size - pad);
        placed = positions.every(p => Math.hypot(p.x - x, p.y - y) > size*1.2); // Increased spacing
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
    
    // Wait for next frame to ensure gym dimensions are stable
    requestAnimationFrame(() => {
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
            <div class="graphic">${equipmentSVG(data.name)}</div>
            <div class="name">${data.name}</div>
            <div class="target">Hold: ${targetSeconds}s</div>
            ${highScoreText ? `<div class="high-score">${highScoreText}</div>` : ''}
          </div>`;
        
        // Use transform instead of left/top for better performance
        el.style.transform = `translate(${positions[i].x}px, ${positions[i].y}px)`;
        el.style.setProperty('--deg', '0deg');
        gymEl.appendChild(el);
        state.holds.set(id, { start: null, targetSeconds, completed:false, elem: el, name: data.name });
        state.equipments.push(el);
      }
      
      totalEl.textContent = String(state.targetCount);
      completedEl.textContent = '0';
      
      // Attach events after DOM is ready
      state.equipments.forEach(attachEquipmentEvents);
    });
  }

  // Hold logic
  function onHoldStart(el){
    const id = el.getAttribute('data-id');
    const info = state.holds.get(id);
    if (!info || info.completed || state.paused) return;
    
    // Only allow one hold at a time for now (can be expanded later)
    if (state.currentId && state.currentId !== id) return;
    
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
      const gained = Math.max(5, Math.round(100 * (1 - Math.min(1, delta / 2))));
      state.score += gained;
      
      // Check for high score
      const accuracy = Math.max(0, Math.round(100 * (1 - Math.min(1, delta / 1.5))));
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
    // IMPROVED TOUCH HANDLING - Better mobile support
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
    
    // Wait a bit for screen transition to complete
    setTimeout(() => {
      createEquipments();
    }, 100);
    
    AudioEngine.startGameMusic();
    rafId = requestAnimationFrame(loop);
  }

  function endGame(won){
    if (rafId) cancelAnimationFrame(rafId);
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

  // IMPROVED RESIZE HANDLING - Debounced and more stable
  function debouncedRelayout() {
    if (state.layoutDebounceId) {
      clearTimeout(state.layoutDebounceId);
    }
    state.layoutDebounceId = setTimeout(() => {
      if (state.playing) {
        createEquipments();
      }
    }, 250); // Wait 250ms after resize stops
  }

  window.addEventListener('resize', debouncedRelayout);

  // Accessibility: prevent context menu interfering with hold
  window.addEventListener('contextmenu', (e)=>{
    if (state.playing) e.preventDefault();
  });

  // IMPROVED MOBILE OPTIMIZATIONS - Better scroll and touch handling
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
    
    // Prevent scroll interference with game
    gymEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
    
    // Better viewport handling
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }
  }

})();


