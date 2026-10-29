// ============================================================================
// DILEMMA BABY - Host Dashboard & CMS Controller
// Socket.io integration with real-time stats, dilemma CMS, and UI text customizer
// ============================================================================

(function () {
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true
  });

  // --- Tabs ---
  const tabLive = document.getElementById('tab-live');
  const tabDilemmas = document.getElementById('tab-dilemmas');
  const tabTexts = document.getElementById('tab-texts');

  const viewLive = document.getElementById('view-live');
  const viewDilemmas = document.getElementById('view-dilemmas');
  const viewTexts = document.getElementById('view-texts');

  // --- Live Controls & Metrics ---
  const happinessCircle = document.getElementById('happiness-circle');
  const happinessNumber = document.getElementById('happiness-number');
  const happinessMoodLabel = document.getElementById('happiness-mood-label');
  const happinessMoodSub = document.getElementById('happiness-mood-sub');
  const happinessSlider = document.getElementById('happiness-slider');
  const btnDecHappiness = document.getElementById('btn-dec-happiness');
  const btnIncHappiness = document.getElementById('btn-inc-happiness');
  const btnResetLobby = document.getElementById('btn-reset-lobby');
  const btnResetSession = document.getElementById('btn-reset-session');

  const hostGameStatus = document.getElementById('host-game-status');
  const queueBadgeCount = document.getElementById('queue-badge-count');
  const hostQueueList = document.getElementById('host-queue-list');
  const hostQueueEmpty = document.getElementById('host-queue-empty');
  const hostMatrixStatus = document.getElementById('host-matrix-status');

  const hostVote1 = document.getElementById('host-vote-1');
  const hostVote2 = document.getElementById('host-vote-2');
  const hostVote3 = document.getElementById('host-vote-3');

  const dilemmaIndexBadge = document.getElementById('dilemma-index-badge');
  const inspectorTitle = document.getElementById('inspector-title');
  const inspectorP1 = document.getElementById('inspector-p1');
  const inspectorP2 = document.getElementById('inspector-p2');
  const inspectorP3 = document.getElementById('inspector-p3');
  const inspectorOptA = document.getElementById('inspector-opt-a');
  const inspectorOptB = document.getElementById('inspector-opt-b');
  const btnSkipDilemma = document.getElementById('btn-skip-dilemma');

  // --- Dilemma CMS Editor Elements ---
  const dilemmaListEl = document.getElementById('dilemma-list');
  const btnNewCase = document.getElementById('btn-new-case');
  const btnSaveDilemmas = document.getElementById('btn-save-dilemmas');
  const btnDeleteCase = document.getElementById('btn-delete-case');
  const btnDuplicateCase = document.getElementById('btn-duplicate-case');

  const editTitle = document.getElementById('edit-title');
  const editP1 = document.getElementById('edit-p1');
  const editP2 = document.getElementById('edit-p2');
  const editP3 = document.getElementById('edit-p3');
  const editOptA = document.getElementById('edit-opt-a');
  const editOptB = document.getElementById('edit-opt-b');

  // --- UI Text Customizer Form Fields ---
  const cfgUnanimous = document.getElementById('cfg-unanimous');
  const cfgSplit = document.getElementById('cfg-split');
  const cfgLobbyWaiting = document.getElementById('cfg-lobby-waiting');
  const cfgLobbyReady = document.getElementById('cfg-lobby-ready');
  const cfgQueue = document.getElementById('cfg-queue');
  const cfgInactivity = document.getElementById('cfg-inactivity');
  const cfgExtendBtn = document.getElementById('cfg-extend-btn');
  const cfgP1Title = document.getElementById('cfg-p1-title');
  const cfgP2Title = document.getElementById('cfg-p2-title');
  const cfgP3Title = document.getElementById('cfg-p3-title');
  const cfgCompleted = document.getElementById('cfg-completed');
  const cfgFooter = document.getElementById('cfg-footer');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  // --- State ---
  let currentState = null;
  let allDilemmas = [];
  let selectedDilemmaIdx = 0;
  let currentSettings = {};

  // --- Tab Switching ---
  function activateTab(tabBtn, viewEl) {
    [tabLive, tabDilemmas, tabTexts].forEach(b => b.classList.remove('active'));
    [viewLive, viewDilemmas, viewTexts].forEach(v => v.style.display = 'none');

    tabBtn.classList.add('active');
    viewEl.style.display = (viewEl === viewLive ? 'grid' : (viewEl === viewDilemmas ? 'grid' : 'block'));
  }

  tabLive.addEventListener('click', () => activateTab(tabLive, viewLive));
  tabDilemmas.addEventListener('click', () => {
    activateTab(tabDilemmas, viewDilemmas);
    loadDilemmas();
  });
  tabTexts.addEventListener('click', () => {
    activateTab(tabTexts, viewTexts);
    loadSettingsIntoForm();
  });

  // --- Mood Calculation ---
  function getMoodDetails(happiness) {
    if (happiness <= 1) {
      return { label: 'Critical Distress', sub: 'Erratic distress spasms', color: 'var(--distress-red)' };
    } else if (happiness <= 3) {
      return { label: 'Agitated Distress', sub: 'Rapid respiration, distress vocalization', color: '#ff6b3d' };
    } else if (happiness === 4) {
      return { label: 'Restless Tension', sub: 'Irregular rhythm, heightened anxiety', color: 'var(--warning-amber)' };
    } else if (happiness === 5) {
      return { label: 'Neutral Equilibrium', sub: 'Steady vital pulse, baseline awareness', color: 'var(--accent-cyan)' };
    } else if (happiness <= 7) {
      return { label: 'Contented Growth', sub: 'Calm rhythmic breathing, receptive', color: '#00d2ff' };
    } else if (happiness <= 9) {
      return { label: 'Harmonious Resonance', sub: 'Deep relaxation, contented vocal tones', color: '#38ef7d' };
    } else {
      return { label: 'Radiant Vital Bliss', sub: 'Optimal homeostasis, vibrant vital state', color: 'var(--happy-green)' };
    }
  }

  function updateHappinessUI(val) {
    const details = getMoodDetails(val);
    if (happinessNumber) happinessNumber.textContent = val;
    if (happinessMoodLabel) happinessMoodLabel.textContent = details.label;
    if (happinessMoodSub) happinessMoodSub.textContent = details.sub;

    if (happinessCircle) {
      happinessCircle.style.borderColor = details.color;
      happinessCircle.style.boxShadow = `0 0 24px ${details.color}40`;
    }
    if (happinessSlider) happinessSlider.value = val;

    document.body.setAttribute('data-mood', val < 5 ? 'distressed' : (val === 5 ? 'neutral' : 'content'));
  }

  // --- Socket Listeners ---
  socket.on('connect', () => {
    socket.emit('register-host');
    loadDilemmas();
  });

  socket.on('host:state', (state) => {
    currentState = state;
    if (state.settings) currentSettings = state.settings;

    updateDashboard(state);
  });

  socket.on('host:saved-ack', (res) => {
    if (res.success) {
      showToast(`Saved ${res.count} dilemmas to server!`);
      loadDilemmas();
    } else {
      showToast(`Error saving: ${res.error}`, true);
    }
  });

  socket.on('host:saved-settings-ack', (res) => {
    if (res.success) {
      showToast('Participant UI texts saved and pushed to all devices!');
    } else {
      showToast(`Error saving texts: ${res.error}`, true);
    }
  });

  // --- Update Dashboard ---
  function updateDashboard(state) {
    updateHappinessUI(state.happiness);

    if (hostGameStatus) {
      hostGameStatus.textContent = (state.status || 'LOBBY').toUpperCase();
    }

    if (queueBadgeCount) {
      queueBadgeCount.textContent = `${state.queueCount || 0} in line`;
    }

    // Render interactive waiting room queue list
    renderHostQueue(state.queueDetails || [], state.players || {});

    // Active Custodians
    const players = state.players || {};
    const votes = state.votes || {};

    updateSlotUI(hostVote1, players['1'], votes['1'], 'Player 1');
    updateSlotUI(hostVote2, players['2'], votes['2'], 'Player 2');
    updateSlotUI(hostVote3, players['3'], votes['3'], 'Player 3');

    // Matrix status text
    if (hostMatrixStatus) {
      if (state.status === 'lobby') {
        hostMatrixStatus.textContent = `${state.activePlayersCount || 0} of 3 players connected in lobby.`;
      } else if (state.status === 'ready') {
        hostMatrixStatus.textContent = 'Lobby ready! Waiting for any player to click Start Game.';
      } else if (state.status === 'active') {
        const vCount = Object.values(votes).filter(Boolean).length;
        hostMatrixStatus.textContent = `Voting active. ${vCount}/${state.activePlayersCount} votes submitted.`;
      } else if (state.status === 'revealed') {
        if (state.result && state.result.consensus) {
          hostMatrixStatus.textContent = `Consensus Reached! All agreed on Choice ${state.result.unanimousChoice}.`;
          hostMatrixStatus.style.color = 'var(--happy-green)';
        } else {
          hostMatrixStatus.textContent = 'Conflict detected: Disagreement across screens.';
          hostMatrixStatus.style.color = 'var(--distress-red)';
        }
      }
    }

    // Dilemma Inspector
    if (dilemmaIndexBadge) {
      dilemmaIndexBadge.textContent = `Directive ${(state.currentDilemmaIndex || 0) + 1} of ${state.totalDilemmas || 5}`;
    }

    if (inspectorTitle) {
      inspectorTitle.textContent = state.currentDilemmaTitle || 'No active directive';
    }

    // Choices
    const choices = state.choices || [];
    const choiceA = choices.find(c => c.id === 'A') || { text: '-' };
    const choiceB = choices.find(c => c.id === 'B') || { text: '-' };
    if (inspectorOptA) inspectorOptA.textContent = choiceA.text;
    if (inspectorOptB) inspectorOptB.textContent = choiceB.text;

    // Perspectives in Live Inspector
    const activeDilemma = allDilemmas[state.currentDilemmaIndex || 0];
    if (activeDilemma && activeDilemma.perspectives) {
      if (inspectorP1) inspectorP1.textContent = activeDilemma.perspectives['1'] || '-';
      if (inspectorP2) inspectorP2.textContent = activeDilemma.perspectives['2'] || '-';
      if (inspectorP3) inspectorP3.textContent = activeDilemma.perspectives['3'] || '-';
    }
  }

  function renderHostQueue(queueDetails, players) {
    if (!hostQueueList || !hostQueueEmpty) return;

    if (!queueDetails || queueDetails.length === 0) {
      hostQueueList.innerHTML = '';
      hostQueueEmpty.style.display = 'block';
      return;
    }

    hostQueueEmpty.style.display = 'none';
    hostQueueList.innerHTML = '';

    // Check if any slot is currently open (null)
    const openSlot = ['1', '2', '3'].find(slot => players[slot] === null);

    queueDetails.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'host-queue-item';

      const isFirst = (idx === 0);
      const isLast = (idx === queueDetails.length - 1);

      row.innerHTML = `
        <div class="host-queue-info">
          <span class="host-queue-pos">#${item.position}</span>
          <span>Client ...${item.shortId}</span>
        </div>
        <div class="host-queue-actions">
          <button class="btn-queue-order" data-dir="up" ${isFirst ? 'disabled' : ''} title="Move up in queue">▲</button>
          <button class="btn-queue-order" data-dir="down" ${isLast ? 'disabled' : ''} title="Move down in queue">▼</button>
          <button class="btn-queue-promote" ${openSlot ? '' : 'disabled'} title="${openSlot ? `Promote directly to Slot ${openSlot}` : 'All slots are full'}">
            ${openSlot ? `Promote (Slot ${openSlot})` : 'Slots Full'}
          </button>
        </div>
      `;

      const upBtn = row.querySelector('.btn-queue-order[data-dir="up"]');
      const downBtn = row.querySelector('.btn-queue-order[data-dir="down"]');
      const promoteBtn = row.querySelector('.btn-queue-promote');

      if (upBtn) {
        upBtn.addEventListener('click', () => {
          socket.emit('host:reorder-queue', { socketId: item.id, direction: 'up' });
        });
      }

      if (downBtn) {
        downBtn.addEventListener('click', () => {
          socket.emit('host:reorder-queue', { socketId: item.id, direction: 'down' });
        });
      }

      if (promoteBtn && openSlot) {
        promoteBtn.addEventListener('click', () => {
          socket.emit('host:promote-player', { socketId: item.id, slot: openSlot });
        });
      }

      hostQueueList.appendChild(row);
    });
  }

  function updateSlotUI(el, socketId, vote, name) {
    if (!el) return;
    if (!socketId) {
      el.className = 'custodian-vote-pill';
      el.textContent = 'Disconnected';
      el.style.opacity = '0.4';
    } else if (vote === 'A') {
      el.className = 'custodian-vote-pill has-voted vote-a';
      el.textContent = 'Choice A';
      el.style.opacity = '1';
    } else if (vote === 'B') {
      el.className = 'custodian-vote-pill has-voted vote-b';
      el.textContent = 'Choice B';
      el.style.opacity = '1';
    } else {
      el.className = 'custodian-vote-pill';
      el.textContent = 'Connected (Deciding...)';
      el.style.opacity = '1';
    }
  }

  // --- Live Controls ---
  happinessSlider.addEventListener('input', (e) => {
    socket.emit('host:set-happiness', { happiness: Number(e.target.value) });
  });

  btnDecHappiness.addEventListener('click', () => {
    if (currentState) {
      socket.emit('host:set-happiness', { happiness: Math.max(0, currentState.happiness - 1) });
    }
  });

  btnIncHappiness.addEventListener('click', () => {
    if (currentState) {
      socket.emit('host:set-happiness', { happiness: Math.min(10, currentState.happiness + 1) });
    }
  });

  btnSkipDilemma.addEventListener('click', () => {
    socket.emit('host:skip-dilemma');
  });

  if (btnResetLobby) {
    btnResetLobby.addEventListener('click', () => {
      if (confirm('Reset Lobby & Kick All Players? This clears all active player slots, empties the waiting queue, and resets happiness to 5.')) {
        socket.emit('host-reset-lobby');
        showToast('Lobby reset — all players kicked & happiness reset to 5.');
      }
    });
  }

  btnResetSession.addEventListener('click', () => {
    if (confirm('Reset entire session to baseline (Happiness = 5, clear active votes, return to lobby)?')) {
      socket.emit('host:reset-session');
      showToast('Session reset to baseline.');
    }
  });

  // --- Dilemma CMS Editor ---
  async function loadDilemmas() {
    try {
      const res = await fetch('/api/dilemmas');
      const data = await res.json();
      allDilemmas = data.dilemmas || [];
      renderDilemmaList();
      populateDilemmaForm(selectedDilemmaIdx);
    } catch (err) {
      console.error('Error fetching dilemmas:', err);
    }
  }

  function renderDilemmaList() {
    if (!dilemmaListEl) return;
    dilemmaListEl.innerHTML = '';

    allDilemmas.forEach((d, idx) => {
      const item = document.createElement('div');
      item.className = 'dilemma-list-item ' + (idx === selectedDilemmaIdx ? 'active' : '');
      item.innerHTML = `
        <span class="dilemma-item-title">${d.title || `Directive ${idx + 1}`}</span>
        <span class="dilemma-item-id">ID: ${d.id}</span>
      `;
      item.addEventListener('click', () => {
        saveFormToMemory();
        selectedDilemmaIdx = idx;
        renderDilemmaList();
        populateDilemmaForm(idx);
      });
      dilemmaListEl.appendChild(item);
    });
  }

  function populateDilemmaForm(idx) {
    const d = allDilemmas[idx];
    if (!d) return;

    editTitle.value = d.title || '';
    editP1.value = d.perspectives?.['1'] || '';
    editP2.value = d.perspectives?.['2'] || '';
    editP3.value = d.perspectives?.['3'] || '';

    const choiceA = d.choices?.find(c => c.id === 'A') || { text: '' };
    const choiceB = d.choices?.find(c => c.id === 'B') || { text: '' };

    editOptA.value = choiceA.text || '';
    editOptB.value = choiceB.text || '';
  }

  function saveFormToMemory() {
    if (selectedDilemmaIdx < 0 || selectedDilemmaIdx >= allDilemmas.length) return;
    const d = allDilemmas[selectedDilemmaIdx];
    if (!d) return;

    d.title = editTitle.value;
    d.perspectives = {
      '1': editP1.value,
      '2': editP2.value,
      '3': editP3.value
    };
    d.choices = [
      { id: 'A', text: editOptA.value },
      { id: 'B', text: editOptB.value }
    ];
  }

  btnSaveDilemmas.addEventListener('click', () => {
    saveFormToMemory();
    socket.emit('host:save-dilemmas', { dilemmas: allDilemmas });
  });

  btnNewCase.addEventListener('click', () => {
    saveFormToMemory();
    const newId = allDilemmas.length + 1;
    const newCase = {
      id: newId,
      title: `Directive 0${newId}: New Directive Scenario`,
      choices: [
        { id: 'A', text: 'Authorize Protocol' },
        { id: 'B', text: 'Decline Protocol' }
      ],
      perspectives: {
        '1': 'ECOLOGICAL IMPACT: Describe environmental footprint...',
        '2': 'SOCIAL TRIAGE: Describe healthcare priority impact...',
        '3': 'DATA AUTONOMY: Describe biometric data or surveillance consequence...'
      }
    };
    allDilemmas.push(newCase);
    selectedDilemmaIdx = allDilemmas.length - 1;
    renderDilemmaList();
    populateDilemmaForm(selectedDilemmaIdx);
    showToast('New case added. Edit fields and click Save.');
  });

  btnDeleteCase.addEventListener('click', () => {
    if (allDilemmas.length <= 1) {
      alert('Cannot delete the last remaining case.');
      return;
    }
    if (confirm(`Delete "${allDilemmas[selectedDilemmaIdx]?.title}"?`)) {
      allDilemmas.splice(selectedDilemmaIdx, 1);
      selectedDilemmaIdx = Math.max(0, selectedDilemmaIdx - 1);
      renderDilemmaList();
      populateDilemmaForm(selectedDilemmaIdx);
      showToast('Directive removed. Click Save to persist.');
    }
  });

  btnDuplicateCase.addEventListener('click', () => {
    saveFormToMemory();
    const curr = allDilemmas[selectedDilemmaIdx];
    if (!curr) return;
    const copy = JSON.parse(JSON.stringify(curr));
    copy.id = allDilemmas.length + 1;
    copy.title = `${copy.title} (Copy)`;
    allDilemmas.splice(selectedDilemmaIdx + 1, 0, copy);
    selectedDilemmaIdx++;
    renderDilemmaList();
    populateDilemmaForm(selectedDilemmaIdx);
    showToast('Directive duplicated.');
  });

  // --- UI Text Customizer ---
  async function loadSettingsIntoForm() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      currentSettings = data.settings || currentSettings;

      if (cfgUnanimous) cfgUnanimous.value = currentSettings.unanimousFeedback || '';
      if (cfgSplit) cfgSplit.value = currentSettings.splitFeedback || '';
      if (cfgLobbyWaiting) cfgLobbyWaiting.value = currentSettings.lobbyWaiting || '';
      if (cfgLobbyReady) cfgLobbyReady.value = currentSettings.lobbyReady || '';
      if (cfgQueue) cfgQueue.value = currentSettings.queueMessage || '';
      if (cfgInactivity) cfgInactivity.value = currentSettings.inactivityWarning || '';
      if (cfgExtendBtn) cfgExtendBtn.value = currentSettings.extendTimeButton || '';
      if (cfgCompleted) cfgCompleted.value = currentSettings.sessionCompleted || '';
      if (cfgFooter) cfgFooter.value = currentSettings.footerText || 'Society 5.0 • Reimagining Autonomy';

      const pTitles = currentSettings.perspectiveTitles || {};
      if (cfgP1Title) cfgP1Title.value = pTitles['1'] || '';
      if (cfgP2Title) cfgP2Title.value = pTitles['2'] || '';
      if (cfgP3Title) cfgP3Title.value = pTitles['3'] || '';
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  }

  btnSaveSettings.addEventListener('click', () => {
    const updated = {
      unanimousFeedback: cfgUnanimous.value,
      splitFeedback: cfgSplit.value,
      lobbyWaiting: cfgLobbyWaiting.value,
      lobbyReady: cfgLobbyReady.value,
      queueMessage: cfgQueue.value,
      inactivityWarning: cfgInactivity.value,
      extendTimeButton: cfgExtendBtn.value,
      sessionCompleted: cfgCompleted.value,
      footerText: cfgFooter ? cfgFooter.value : 'Society 5.0 • Reimagining Autonomy',
      perspectiveTitles: {
        '1': cfgP1Title.value,
        '2': cfgP2Title.value,
        '3': cfgP3Title.value
      }
    };

    socket.emit('host:save-settings', { settings: updated });
  });

  // --- Toast Feedback ---
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

})();
