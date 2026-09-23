// ============================================================================
// Autonomy Baby - Host Dashboard & Admin Prompt Editor Controller
// Handles facilitator controls, Web Serial Arduino bridge, and Dilemma CMS
// ============================================================================

(function () {
  // --- DOM References ---
  // Tabs
  const tabLive = document.getElementById('tab-live');
  const tabEditor = document.getElementById('tab-editor');
  const viewLive = document.getElementById('view-live');
  const viewEditor = document.getElementById('view-editor');

  // Happiness Widget
  const happinessCircle = document.getElementById('happiness-circle');
  const happinessNumber = document.getElementById('happiness-number');
  const happinessMoodLabel = document.getElementById('happiness-mood-label');
  const happinessMoodSub = document.getElementById('happiness-mood-sub');
  const happinessSlider = document.getElementById('happiness-slider');
  const btnDecHappiness = document.getElementById('btn-dec-happiness');
  const btnIncHappiness = document.getElementById('btn-inc-happiness');

  // Emergency / Reset
  const btnResetExperience = document.getElementById('btn-reset-experience');

  // Custodian Matrix
  const custodianVote1 = document.getElementById('custodian-vote-1');
  const custodianVote2 = document.getElementById('custodian-vote-2');
  const custodianVote3 = document.getElementById('custodian-vote-3');
  const matrixStatusBanner = document.getElementById('matrix-status-banner');

  // Active Case Inspector
  const inspectorTitle = document.getElementById('inspector-title');
  const inspectorContext = document.getElementById('inspector-context');
  const inspectorPerspective1 = document.getElementById('inspector-p1');
  const inspectorPerspective2 = document.getElementById('inspector-p2');
  const inspectorPerspective3 = document.getElementById('inspector-p3');
  const inspectorOptionA = document.getElementById('inspector-opt-a');
  const inspectorOptionB = document.getElementById('inspector-opt-b');

  // Round Navigation
  const btnPrevCase = document.getElementById('btn-prev-case');
  const btnNextCase = document.getElementById('btn-next-case');
  const btnReopenVoting = document.getElementById('btn-reopen-voting');
  const btnForceReveal = document.getElementById('btn-force-reveal');
  const currentCaseBadge = document.getElementById('current-case-badge');

  // Arduino Web Serial
  const btnSerialConnect = document.getElementById('btn-serial-connect');
  const btnSerialDisconnect = document.getElementById('btn-serial-disconnect');
  const serialStatusDot = document.getElementById('serial-status-dot');
  const serialStatusText = document.getElementById('serial-status-text');
  const serialBaudSelect = document.getElementById('serial-baud');
  const serialLogEl = document.getElementById('serial-log');
  const btnTestRed = document.getElementById('btn-test-red');
  const btnTestNeutral = document.getElementById('btn-test-neutral');
  const btnTestGreen = document.getElementById('btn-test-green');

  // Audio Controls
  const toggleMute = document.getElementById('toggle-mute');
  const btnSoundHeartbeat = document.getElementById('btn-sound-heartbeat');
  const btnSoundCoo = document.getElementById('btn-sound-coo');
  const btnSoundCry = document.getElementById('btn-sound-cry');

  // Editor Pane Elements
  const dilemmaListEl = document.getElementById('dilemma-list');
  const btnNewCase = document.getElementById('btn-new-case');
  const btnSaveCases = document.getElementById('btn-save-cases');
  const btnDeleteCase = document.getElementById('btn-delete-case');
  const btnDuplicateCase = document.getElementById('btn-duplicate-case');

  // Form Fields
  const editTitle = document.getElementById('edit-title');
  const editContext = document.getElementById('edit-context');
  const editP1 = document.getElementById('edit-p1');
  const editP2 = document.getElementById('edit-p2');
  const editP3 = document.getElementById('edit-p3');
  const editOptALabel = document.getElementById('edit-opt-a-label');
  const editOptASub = document.getElementById('edit-opt-a-sub');
  const editOptBLabel = document.getElementById('edit-opt-b-label');
  const editOptBSub = document.getElementById('edit-opt-b-sub');

  // --- Local State ---
  let currentState = null;
  let allDilemmas = [];
  let selectedEditorIndex = 0;
  let lastDispatchedHappiness = null;

  // --- Tab Switching ---
  tabLive.addEventListener('click', () => {
    tabLive.classList.add('active');
    tabEditor.classList.remove('active');
    viewLive.style.display = 'grid';
    viewEditor.style.display = 'none';
  });

  tabEditor.addEventListener('click', () => {
    tabEditor.classList.add('active');
    tabLive.classList.remove('active');
    viewLive.style.display = 'none';
    viewEditor.style.display = 'grid';
    loadDilemmasForEditor();
  });

  // --- Happiness & Mood Formatting ---
  function getMoodDetails(happiness) {
    if (happiness <= 1) {
      return { label: 'Critical Distress', sub: 'Erratic distress spasms', color: 'var(--distress-red)', aura: 'var(--distress-glow)' };
    } else if (happiness <= 3) {
      return { label: 'Agitated Distress', sub: 'Rapid respiration, distress vocalization', color: '#ff6b3d', aura: 'rgba(255, 107, 61, 0.4)' };
    } else if (happiness === 4) {
      return { label: 'Restless Tension', sub: 'Irregular rhythm, heightened anxiety', color: 'var(--warning-amber)', aura: 'var(--warning-glow)' };
    } else if (happiness === 5) {
      return { label: 'Neutral Equilibrium', sub: 'Steady vital pulse, baseline awareness', color: 'var(--accent-cyan)', aura: 'var(--accent-cyan-glow)' };
    } else if (happiness <= 7) {
      return { label: 'Contented Growth', sub: 'Calm rhythmic breathing, receptive', color: '#00d2ff', aura: 'rgba(0, 210, 255, 0.4)' };
    } else if (happiness <= 9) {
      return { label: 'Harmonious Resonance', sub: 'Deep relaxation, contented vocal tones', color: '#38ef7d', aura: 'rgba(56, 239, 125, 0.4)' };
    } else {
      return { label: 'Radiant Vital Bliss', sub: 'Optimal homeostasis, vibrant vital state', color: 'var(--happy-green)', aura: 'var(--happy-glow)' };
    }
  }

  function updateHappinessUI(val) {
    const details = getMoodDetails(val);
    happinessNumber.textContent = val;
    happinessMoodLabel.textContent = details.label;
    happinessMoodSub.textContent = details.sub;

    happinessCircle.style.borderColor = details.color;
    happinessCircle.style.boxShadow = `0 0 24px ${details.aura}`;
    happinessSlider.value = val;

    document.body.setAttribute('data-mood', val < 5 ? 'distressed' : (val === 5 ? 'neutral' : 'content'));

    // Send to Arduino if changed
    if (lastDispatchedHappiness !== val) {
      window.arduinoSerial.sendHappiness(val);
      lastDispatchedHappiness = val;
    }
  }

  // --- API Actions ---
  async function apiCall(endpoint, payload = {}) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      showToast(`Error: ${err.message}`, true);
    }
  }

  // Set Happiness
  async function setHappiness(val) {
    await apiCall('/api/host/set-happiness', { happiness: val });
  }

  happinessSlider.addEventListener('input', (e) => setHappiness(Number(e.target.value)));
  btnDecHappiness.addEventListener('click', () => {
    if (currentState) setHappiness(Math.max(0, currentState.happiness - 1));
  });
  btnIncHappiness.addEventListener('click', () => {
    if (currentState) setHappiness(Math.min(10, currentState.happiness + 1));
  });

  // Emergency Reset
  btnResetExperience.addEventListener('click', async () => {
    if (confirm('Reset experience to initial baseline (Happiness = 5, clear votes)?')) {
      await apiCall('/api/host/reset');
      window.arduinoSerial.sendReset();
      showToast('Experience successfully reset to baseline.');
    }
  });

  // Directive Nav
  btnPrevCase.addEventListener('click', () => apiCall('/api/host/prev-dilemma'));
  btnNextCase.addEventListener('click', () => apiCall('/api/host/next-dilemma'));
  btnReopenVoting.addEventListener('click', () => apiCall('/api/host/reopen-voting'));
  btnForceReveal.addEventListener('click', () => apiCall('/api/host/force-reveal'));

  // --- Update Live Dashboard with Server State ---
  function updateDashboard(state) {
    currentState = state;
    updateHappinessUI(state.happiness);

    // Current Dilemma info
    const d = state.currentDilemma;
    if (d) {
      inspectorTitle.textContent = d.title;
      inspectorContext.textContent = d.context;
      inspectorPerspective1.textContent = d.screen1;
      inspectorPerspective2.textContent = d.screen2;
      inspectorPerspective3.textContent = d.screen3;
      inspectorOptionA.textContent = `${d.optionA?.label || 'Option A'}: ${d.optionA?.subtext || ''}`;
      inspectorOptionB.textContent = `${d.optionB?.label || 'Option B'}: ${d.optionB?.subtext || ''}`;
      currentCaseBadge.textContent = `Case ${(state.currentDilemmaIndex + 1)} of ${state.totalDilemmas}`;
    }

    // Custodian Votes Matrix
    const v = state.votes || {};
    const isRevealed = state.status === 'revealed';
    updateCustodianVoteCard(custodianVote1, v['1'], isRevealed);
    updateCustodianVoteCard(custodianVote2, v['2'], isRevealed);
    updateCustodianVoteCard(custodianVote3, v['3'], isRevealed);

    // Matrix status text
    if (state.status === 'voting') {
      const count = Object.values(v).filter(x => x !== null).length;
      matrixStatusBanner.innerHTML = `<span class="badge badge-pulse">Voting Open</span> &nbsp; ${count} of 3 Custodians have voted.`;
      matrixStatusBanner.style.color = 'var(--text-secondary)';
    } else if (state.status === 'revealed' && state.result) {
      if (state.result.consensus) {
        const activeCount = state.result.activeVoteCount;
        const note = (activeCount && activeCount < 3) ? ` (${activeCount}/3 answered; unvoted screens set aside)` : '';
        matrixStatusBanner.innerHTML = `<span class="badge" style="color:var(--happy-green); border-color:var(--happy-green)">Consensus Achieved</span> &nbsp; All active custodians agreed on Choice ${state.result.unanimousChoice}${note}.`;
        matrixStatusBanner.style.color = 'var(--happy-green)';
      } else {
        matrixStatusBanner.innerHTML = `<span class="badge" style="color:var(--distress-red); border-color:var(--distress-red)">Consensus Failed</span> &nbsp; Split determinations detected.`;
        matrixStatusBanner.style.color = 'var(--distress-red)';
      }
    }

    // Update Auto-Advance Countdown
    updateHostCountdown(state);
  }

  function updateCustodianVoteCard(el, val, isRevealed) {
    if (!el) return;
    if (val === null) {
      el.className = 'custodian-vote-pill';
      if (isRevealed) {
        el.textContent = 'No Answer (Uncounted)';
        el.style.opacity = '0.5';
      } else {
        el.textContent = 'Awaiting...';
        el.style.opacity = '1';
      }
    } else {
      el.style.opacity = '1';
      el.className = 'custodian-vote-pill has-voted ' + (val === 'A' ? 'vote-a' : 'vote-b');
      el.textContent = `Choice ${val}`;
    }
  }

  // --- Host Auto-Advance Countdown Controller ---
  const selectAutoAdvance = document.getElementById('select-auto-advance');
  const hostCountdownCard = document.getElementById('host-countdown-card');
  const hostCountdownSec = document.getElementById('host-countdown-sec');
  const hostCountdownBar = document.getElementById('host-countdown-bar');
  const btnSkipCountdown = document.getElementById('btn-skip-countdown');
  const btnPauseCountdown = document.getElementById('btn-pause-countdown');
  let hostCountdownInterval = null;

  if (selectAutoAdvance) {
    selectAutoAdvance.addEventListener('change', (e) => {
      const val = Number(e.target.value);
      apiCall('/api/host/configure-auto-advance', {
        enabled: val > 0,
        duration: val > 0 ? val : 8
      });
    });
  }

  if (btnSkipCountdown) {
    btnSkipCountdown.addEventListener('click', () => {
      apiCall('/api/host/skip-countdown');
    });
  }

  if (btnPauseCountdown) {
    btnPauseCountdown.addEventListener('click', () => {
      apiCall('/api/host/pause-countdown');
    });
  }

  function updateHostCountdown(state) {
    if (hostCountdownInterval) {
      clearInterval(hostCountdownInterval);
      hostCountdownInterval = null;
    }

    if (!state.autoAdvanceAt || state.status !== 'revealed') {
      if (hostCountdownCard) hostCountdownCard.style.display = 'none';
      return;
    }

    if (hostCountdownCard) hostCountdownCard.style.display = 'block';

    function tick() {
      const now = Date.now();
      const remainingMs = state.autoAdvanceAt - now;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      const totalSec = state.autoAdvanceDuration || 8;
      const percent = Math.max(0, Math.min(100, (remainingMs / (totalSec * 1000)) * 100));

      if (hostCountdownSec) hostCountdownSec.textContent = `${remainingSec}s`;
      if (hostCountdownBar) hostCountdownBar.style.width = `${percent}%`;

      if (remainingMs <= 0) {
        clearInterval(hostCountdownInterval);
        hostCountdownInterval = null;
      }
    }

    tick();
    hostCountdownInterval = setInterval(tick, 100);
  }

  // --- Arduino Web Serial Integration ---
  window.arduinoSerial.onStatusChange = (connected) => {
    serialStatusDot.className = 'status-dot ' + (connected ? 'connected' : '');
    serialStatusText.textContent = connected ? 'Connected' : 'Disconnected';
    btnSerialConnect.style.display = connected ? 'none' : 'inline-flex';
    btnSerialDisconnect.style.display = connected ? 'inline-flex' : 'none';
  };

  window.arduinoSerial.onLog = (msg) => {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    serialLogEl.appendChild(line);
    serialLogEl.scrollTop = serialLogEl.scrollHeight;
  };

  btnSerialConnect.addEventListener('click', async () => {
    try {
      await window.arduinoSerial.connect(serialBaudSelect.value);
      if (currentState) {
        window.arduinoSerial.sendHappiness(currentState.happiness);
      }
    } catch (e) {
      alert(`Could not connect: ${e.message}`);
    }
  });

  btnSerialDisconnect.addEventListener('click', () => {
    window.arduinoSerial.disconnect();
  });

  btnTestRed.addEventListener('click', () => window.arduinoSerial.sendTestColor('RED'));
  btnTestNeutral.addEventListener('click', () => window.arduinoSerial.sendTestColor('NEUTRAL'));
  btnTestGreen.addEventListener('click', () => window.arduinoSerial.sendTestColor('GREEN'));

  // --- Audio Synthesizer Controls ---
  toggleMute.addEventListener('change', (e) => {
    window.soundEngine.setMuted(e.target.checked);
  });

  btnSoundHeartbeat.addEventListener('click', () => window.soundEngine.playHeartbeat(currentState?.happiness || 5));
  btnSoundCoo.addEventListener('click', () => window.soundEngine.playVocalTone(9));
  btnSoundCry.addEventListener('click', () => window.soundEngine.playVocalTone(1));

  // --- Dilemma & Prompt Editor (Admin CMS) ---
  async function loadDilemmasForEditor() {
    try {
      const res = await fetch('/api/dilemmas');
      const data = await res.json();
      allDilemmas = data.dilemmas || [];
      renderEditorList();
      populateForm(selectedEditorIndex);
    } catch (e) {
      console.error('Error fetching dilemmas:', e);
    }
  }

  function renderEditorList() {
    dilemmaListEl.innerHTML = '';
    allDilemmas.forEach((d, idx) => {
      const item = document.createElement('div');
      item.className = 'dilemma-list-item ' + (idx === selectedEditorIndex ? 'active' : '');
      item.innerHTML = `
        <span class="dilemma-item-title">${d.title || `Case ${idx + 1}`}</span>
        <span class="dilemma-item-id">ID: ${d.id || `case-${idx + 1}`}</span>
      `;
      item.addEventListener('click', () => {
        saveCurrentFormToMemory();
        selectedEditorIndex = idx;
        renderEditorList();
        populateForm(idx);
      });
      dilemmaListEl.appendChild(item);
    });
  }

  function populateForm(idx) {
    const d = allDilemmas[idx];
    if (!d) return;

    editTitle.value = d.title || '';
    editContext.value = d.context || '';
    editP1.value = d.screen1 || '';
    editP2.value = d.screen2 || '';
    editP3.value = d.screen3 || '';
    editOptALabel.value = d.optionA?.label || '';
    editOptASub.value = d.optionA?.subtext || '';
    editOptBLabel.value = d.optionB?.label || '';
    editOptBSub.value = d.optionB?.subtext || '';
  }

  function saveCurrentFormToMemory() {
    if (selectedEditorIndex < 0 || selectedEditorIndex >= allDilemmas.length) return;
    const d = allDilemmas[selectedEditorIndex];
    if (!d) return;

    d.title = editTitle.value;
    d.context = editContext.value;
    d.screen1 = editP1.value;
    d.screen2 = editP2.value;
    d.screen3 = editP3.value;
    d.optionA = {
      id: 'A',
      label: editOptALabel.value,
      subtext: editOptASub.value
    };
    d.optionB = {
      id: 'B',
      label: editOptBLabel.value,
      subtext: editOptBSub.value
    };
  }

  // Save to server
  btnSaveCases.addEventListener('click', async () => {
    saveCurrentFormToMemory();

    const res = await apiCall('/api/host/save-dilemmas', { dilemmas: allDilemmas });
    if (res && res.success) {
      showToast(`Saved ${res.count} cases to server! Synced with screens.`);
      renderEditorList();
    }
  });

  // Add new case
  btnNewCase.addEventListener('click', () => {
    saveCurrentFormToMemory();
    const newIdx = allDilemmas.length + 1;
    const newCase = {
      id: `case-${Date.now().toString().slice(-4)}`,
      title: `Directive ${newIdx}: New Case Scenario`,
      context: 'Describe the core bio-ethical situation that all 3 custodians share.',
      screen1: 'Screen 1 operational finding (e.g. ecological / environmental footprint)...',
      screen2: 'Screen 2 operational finding (e.g. human triage / social queue impact)...',
      screen3: 'Screen 3 operational finding (e.g. bodily autonomy / algorithmic servitude)...',
      optionA: { id: 'A', label: 'Authorize Protocol', subtext: 'Execute immediate intervention.' },
      optionB: { id: 'B', label: 'Decline Protocol', subtext: 'Reject intervention; seek alternative.' }
    };
    allDilemmas.push(newCase);
    selectedEditorIndex = allDilemmas.length - 1;
    renderEditorList();
    populateForm(selectedEditorIndex);
    showToast('New case added. Edit fields and click Save.');
  });

  // Delete case
  btnDeleteCase.addEventListener('click', () => {
    if (allDilemmas.length <= 1) {
      alert('Cannot delete the last remaining case.');
      return;
    }
    if (confirm(`Delete "${allDilemmas[selectedEditorIndex]?.title}"?`)) {
      allDilemmas.splice(selectedEditorIndex, 1);
      selectedEditorIndex = Math.max(0, selectedEditorIndex - 1);
      renderEditorList();
      populateForm(selectedEditorIndex);
      showToast('Case removed from list. Click Save to persist.');
    }
  });

  // Duplicate case
  btnDuplicateCase.addEventListener('click', () => {
    saveCurrentFormToMemory();
    const current = allDilemmas[selectedEditorIndex];
    if (!current) return;
    const copy = JSON.parse(JSON.stringify(current));
    copy.id = `case-${Date.now().toString().slice(-4)}`;
    copy.title = `${copy.title} (Copy)`;
    allDilemmas.splice(selectedEditorIndex + 1, 0, copy);
    selectedEditorIndex++;
    renderEditorList();
    populateForm(selectedEditorIndex);
    showToast('Case duplicated.');
  });

  // --- Toast Notification ---
  function showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (isError) {
      toast.style.borderColor = 'var(--distress-red)';
      toast.style.color = 'var(--distress-red)';
    }
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // --- SSE Event Stream for Live Updates ---
  function connectSSE() {
    const evtSource = new EventSource('/api/events');

    evtSource.onmessage = function (event) {
      try {
        const state = JSON.parse(event.data);
        updateDashboard(state);
      } catch (err) {
        console.error('Error handling SSE state in host:', err);
      }
    };

    evtSource.onerror = function () {
      console.warn('SSE connection disconnected. Reconnecting...');
    };
  }

  connectSSE();
})();
