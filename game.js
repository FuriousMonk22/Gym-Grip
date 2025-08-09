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
      ensure();
      // Only play if audio context is running
      if (ctx.state !== 'running') return;
      
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(sfxGain);
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.start();
      osc.stop(t + duration + 0.02);
    }

    function playMusicNote(freq = 440, duration = 0.25, type = 'sine', gain = 0.06){
      ensure();
      // Only play if audio context is running
      if (ctx.state !== 'running') return;
      
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = 0.0001;
      osc.connect(g); g.connect(musicGain);
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }

    function playSuccess(){ playTone(740, 0.12, 'triangle', 0.25); setTimeout(()=>playTone(880,0.12,'triangle',0.22), 90) }
    function playFail(){ playTone(180, 0.25, 'sawtooth', 0.2) }
    function playClick(){ playTone(520, 0.06, 'square', 0.12) }

    function startSong(index){
      ensure();
      if (musicTimer){ clearInterval(musicTimer); musicTimer = null; }
      currentSongIndex = index % SONGS.length;
      const song = SONGS[currentSongIndex];
      stepIndex = 0;
      stepsInCurrentSong = song.seq.length * 32; // song length in steps
      const stepMs = 60000 / (song.tempo * 2); // 8th-note grid
      musicTimer = setInterval(()=>{
        const s = SONGS[currentSongIndex];
        const deg = s.seq[stepIndex % s.seq.length];
        const base = s.base;
        const dur = (60000 / s.tempo) / 1000 * 0.9; // mostly quarter
        // 3 voices at different timbres/octaves
        playMusicNote(base * Math.pow(2, deg/12), dur, 'sine', 0.05);
        if (stepIndex % 2 === 0){
          playMusicNote(base*2 * Math.pow(2, deg/12), dur*0.6, 'triangle', 0.03);
        }
        if (stepIndex % 4 === 0){
          const bassDeg = s.seq[(stepIndex/4|0)%s.seq.length] - 12;
          playMusicNote(base/2 * Math.pow(2, bassDeg/12), dur*1.2, 'square', 0.02);
        }
        stepIndex++;
        if (stepIndex >= stepsInCurrentSong){
          // advance to next song, loop back after last
          startSong((currentSongIndex + 1) % SONGS.length);
        }
      }, stepMs);
    }



    function startGameMusic(){
      ensure();
      // Clear any existing music first
      if (musicTimer){ clearInterval(musicTimer); musicTimer = null; }
      currentMode = 'game';
      // Small delay to ensure audio context is ready
      setTimeout(() => {
        startSong(0);
      }, 10);
    }

    function stopAllMusic(){
      if (musicTimer){ clearInterval(musicTimer); musicTimer = null; }
      currentMode = 'none';
      // Reset step index to avoid any lingering state
      stepIndex = 0;
      currentSongIndex = 0;
      stepsInCurrentSong = 0;
    }

    function stopMusic(){
      stopAllMusic();
    }

    return { resume, suspend, setMusicVol, setSfxVol, startGameMusic, stopMusic, stopAllMusic, playSuccess, playFail, playClick, ensure };
  })();

  // Toast / fun coach messages
  let toastTimer;
  function showToast(message, mood='info'){
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.style.borderColor = mood==='bad' ? '#ff4d6d' : mood==='good' ? '#2ecc71' : '#3a507f';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> toast.classList.add('hidden'), 1700);
  }

  // Random helper
  const rnd = (min, max) => Math.random()*(max-min)+min;

  // SVG graphics for equipment
  function equipmentSVG(name){
    const common = {
      stroke: '#0a1529',
      metal: '#8fb3ff',
      rubber: '#243a6b',
      accent: '#38d39f'
    };
    switch(name){
      case 'Dumbbell':
        return `
          <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true">
            <defs>
              <linearGradient id="dbMetal" x1="0" x2="1">
                <stop offset="0%" stop-color="#a9c8ff"/>
                <stop offset="100%" stop-color="#5f86d7"/>
              </linearGradient>
            </defs>
            <rect x="18" y="52" width="84" height="16" rx="6" fill="url(#dbMetal)" stroke="${common.stroke}"/>
            <rect x="8" y="44" width="16" height="32" rx="6" fill="${common.rubber}" stroke="${common.stroke}"/>
            <rect x="96" y="44" width="16" height="32" rx="6" fill="${common.rubber}" stroke="${common.stroke}"/>
            <rect x="48" y="44" width="24" height="32" rx="6" fill="#d8e6ff" stroke="${common.stroke}" opacity=".9"/>
          </svg>`;
      case 'Kettlebell':
        return `
          <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true">
            <path d="M40 48c0-12 10-22 22-22s22 10 22 22" fill="none" stroke="#5f86d7" stroke-width="10"/>
            <ellipse cx="62" cy="78" rx="30" ry="26" fill="#2b3b66" stroke="${common.stroke}"/>
          </svg>`;
      case 'Treadmill':
        return `
          <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true">
            <rect x="20" y="70" width="80" height="16" rx="8" fill="#223456" stroke="${common.stroke}"/>
            <rect x="32" y="40" width="12" height="36" rx="6" fill="#5f86d7" stroke="${common.stroke}"/>
            <rect x="78" y="40" width="12" height="36" rx="6" fill="#5f86d7" stroke="${common.stroke}"/>
            <rect x="22" y="64" width="76" height="8" fill="#0d1a2f"/>
          </svg>`;
      case 'Rowing':
        return `
          <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true">
            <rect x="28" y="64" width="64" height="10" rx="5" fill="#223456" stroke="${common.stroke}"/>
            <circle cx="90" cy="69" r="10" fill="#2b3b66" stroke="${common.stroke}"/>
            <rect x="38" y="48" width="18" height="10" rx="4" fill="#5f86d7" stroke="${common.stroke}"/>
            <rect x="52" y="40" width="6" height="24" rx="3" fill="#d8e6ff" stroke="${common.stroke}"/>
          </svg>`;
      case 'Bench':
        return `
          <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true">
            <rect x="26" y="56" width="68" height="14" rx="6" fill="#2b3b66" stroke="${common.stroke}"/>
            <rect x="34" y="70" width="6" height="18" fill="#5f86d7" stroke="${common.stroke}"/>
            <rect x="84" y="70" width="6" height="18" fill="#5f86d7" stroke="${common.stroke}"/>
          </svg>`;
      case 'Jump Rope':
        return `
          <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true">
            <path d="M28 48c10-12 34-12 44 0s22 12 28 0" fill="none" stroke="#38d39f" stroke-width="6"/>
            <rect x="18" y="44" width="10" height="16" rx="4" fill="#5f86d7" stroke="${common.stroke}"/>
            <rect x="92" y="44" width="10" height="16" rx="4" fill="#5f86d7" stroke="${common.stroke}"/>
          </svg>`;
      case 'Medicine Ball':
        return `
          <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true">
            <circle cx="60" cy="60" r="26" fill="#2b3b66" stroke="${common.stroke}"/>
            <path d="M42 60h36" stroke="#5f86d7" stroke-width="6"/>
          </svg>`;
      case 'Bike':
        return `
          <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true">
            <circle cx="40" cy="80" r="14" fill="#203454" stroke="${common.stroke}"/>
            <circle cx="84" cy="80" r="14" fill="#203454" stroke="${common.stroke}"/>
            <path d="M40 80 L56 60 L76 80 L68 64 L84 64" fill="none" stroke="#5f86d7" stroke-width="6"/>
          </svg>`;
      default:
        return `
          <svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true">
            <rect x="30" y="30" width="60" height="60" rx="12" fill="#2b3b66" stroke="${common.stroke}"/>
          </svg>`;
    }
  }

  // Game state
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
    const pad = 30; const size = 120; // equipment size basis
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
      el.innerHTML = `
        <div class="progress-ring"></div>
        <div class="content">
          <div class="icon" style="font-size:32px">${data.icon}</div>
          <div class="name">${data.name}</div>
          <div class="target">Hold: ${targetSeconds}s</div>
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
      AudioEngine.playSuccess();
      showToast(`Nailed it! +${gained} pts (off by ${delta.toFixed(1)}s)`, 'good');
      state.completed++;
      completedEl.textContent = String(state.completed);
      scoreEl.textContent = String(state.score);
      bigTimer.textContent = 'Pick another equipment';
      accuracyEl.textContent = '';
      el.classList.add('disabled');
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
    // mouse
    el.addEventListener('mousedown', (e)=>{ e.preventDefault(); onHoldStart(el); });
    window.addEventListener('mouseup', (e)=>{
      if (state.currentId === el.getAttribute('data-id')) onHoldEnd(el);
    });
    // touch
    el.addEventListener('touchstart', (e)=>{ e.preventDefault(); onHoldStart(el); }, {passive:false});
    window.addEventListener('touchend', (e)=>{
      if (state.currentId === el.getAttribute('data-id')) onHoldEnd(el);
    }, {passive:true});
    window.addEventListener('touchcancel', (e)=>{
      if (state.currentId === el.getAttribute('data-id')) onHoldEnd(el, true);
    }, {passive:true});
    // leave area cancels
    el.addEventListener('mouseleave', ()=>{
      if (state.currentId === el.getAttribute('data-id')){
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
    endStats.textContent = `Score: ${state.score} | Completed: ${state.completed}/${state.targetCount}`;
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


})();


