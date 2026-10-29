// ============================================================================
// DILEMMA BABY - Mobile Player Experience
// Society 5.0 Festival • "Reimagining Autonomy"
// 100% English participant interface with Socket.io, Queue, Inactivity Timers
// ============================================================================

(function () {
  // --- DOM Elements ---
  const vitalScoreEl = document.getElementById('vital-score');
  const btnExtendTime = document.getElementById('extend-timer-btn') || document.getElementById('btn-extend-time');

  // Views
  const viewConnecting = document.getElementById('view-connecting');
  const viewQueue = document.getElementById('view-queue');
  const viewLobby = document.getElementById('view-lobby');
  const viewDilemma = document.getElementById('view-dilemma');
  const viewReveal = document.getElementById('view-reveal');
  const viewCompleted = document.getElementById('view-completed');
  const viewInactivityEnded = document.getElementById('view-inactivity-ended');

  // Mid-Game Modal Elements (overlay, not a view-section)
  const modalMidGame = document.getElementById('modal-mid-game');
  const midGameDesc = document.getElementById('mid-game-desc');
  const btnJoinCurrent = document.getElementById('btn-join-current');
  const btnWaitNext = document.getElementById('btn-wait-next');

  // Session Ended Elements
  const btnReturnLobby = document.getElementById('btn-return-lobby');

  // Queue Elements
  const queuePositionEl = document.getElementById('queue-position');
  const queueMessageEl = document.getElementById('queue-message');

  // Lobby Elements
  const lobbySlotBadge = document.getElementById('lobby-slot-badge');
  const lobbyStatusMsg = document.getElementById('lobby-status-msg');
  const slotInd1 = document.getElementById('slot-ind-1');
  const slotInd2 = document.getElementById('slot-ind-2');
  const slotInd3 = document.getElementById('slot-ind-3');
  const lobbyActionBox = document.getElementById('lobby-action-box');
  const btnStartNow = document.getElementById('btn-start-now');
  const lobbyRejoinBox = document.getElementById('lobby-rejoin-box');
  const btnRejoinLobby = document.getElementById('btn-rejoin-lobby');

  // Dilemma Elements
  const dilemmaIndexLabel = document.getElementById('dilemma-index-label');
  const dilemmaTitle = document.getElementById('dilemma-title');
  const perspectiveTitle = document.getElementById('perspective-title');
  const perspectiveBody = document.getElementById('perspective-body');
  const btnChoiceA = document.getElementById('btn-choice-a');
  const btnChoiceB = document.getElementById('btn-choice-b');
  const choiceAText = document.getElementById('choice-a-text');
  const choiceBText = document.getElementById('choice-b-text');
  const voteSubmittedBanner = document.getElementById('vote-submitted-banner');
  const voteLockedText = document.getElementById('vote-locked-text');

  // Reveal Elements
  const revealCard = document.getElementById('reveal-card');
  const revealTitle = document.getElementById('reveal-title');
  const revealMessage = document.getElementById('reveal-message');
  const bd1 = document.getElementById('bd-1');
  const bd2 = document.getElementById('bd-2');
  const bd3 = document.getElementById('bd-3');
  const revealProgress = document.getElementById('reveal-progress');

  // Completed Elements
  const completedText = document.getElementById('completed-text');

  // Inactivity Modal Elements
  const modalInactivity = document.getElementById('modal-inactivity');
  const inactivityCountdown = document.getElementById('inactivity-countdown');
  const btnImHere = document.getElementById('btn-im-here');

  // --- Local State ---
  let mySlot = null;
  let isQueued = false;
  let isPendingLateJoin = false;
  let myVote = null;
  let latestState = null;
  let settings = {};
  let inactivityInterval = null;
  let revealProgressInterval = null;

  // --- Socket.io Setup ---
  // Works with local ws:// and cloud wss:// automatically
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  });

  // Helper: Switch Active View (modals are separate overlays, not view-sections)
  function showView(target) {
    [
      viewConnecting,
      viewQueue,
      viewLobby,
      viewDilemma,
      viewReveal,
      viewCompleted,
      viewInactivityEnded
    ].forEach(el => {
      if (el) el.classList.remove('active');
    });
    if (target) target.classList.add('active');
  }

  function showMidGameModal(show) {
    if (modalMidGame) {
      if (show) modalMidGame.classList.add('active');
      else modalMidGame.classList.remove('active');
    }
  }

  // --- Connection Status Handlers ---
  socket.on('connect', () => {
    console.log('[SOCKET] Connected to bio-server with ID:', socket.id);
    // Explicitly join as a mobile player (prevents hub/host from being counted as players)
    socket.emit('join-game');
  });

  socket.on('connect_error', (err) => {
    console.warn('[SOCKET] Connecting to cloud instance...', err.message);
    showView(viewConnecting);
  });

  socket.on('disconnect', () => {
    console.warn('[SOCKET] Disconnected. Reconnecting...');
    showView(viewConnecting);
  });

  // --- Initialization ---
  socket.on('init-state', (data) => {
    mySlot = data.slot;
    isQueued = !!data.isQueued;
    isPendingLateJoin = !!data.pendingMidGame;
    settings = data.settings || {};
    if (lobbyRejoinBox) lobbyRejoinBox.style.display = 'none';
    if (isPendingLateJoin) {
      showMidGameModal(true);
    }
    updateFromState(data.state);
  });

  socket.on('assigned-slot', (data) => {
    mySlot = data.slot;
    isQueued = false;
    isPendingLateJoin = false;
    settings = data.settings || settings;
    if (lobbyRejoinBox) lobbyRejoinBox.style.display = 'none';
    showMidGameModal(false);
    console.log('[SLOT] Assigned to Slot:', mySlot);
  });

  // --- Host Force Lobby Reset (Kicks all players back to lobby screen) ---
  socket.on('lobby-force-reset', () => {
    console.log('[RESET] Host reset the lobby. Clearing local slot state.');
    mySlot = null;
    isQueued = false;
    isPendingLateJoin = false;
    myVote = null;

    hideInactivityModal();
    showMidGameModal(false);

    if (vitalScoreEl) vitalScoreEl.textContent = '5/10';
    showView(viewLobby);

    if (lobbySlotBadge) lobbySlotBadge.textContent = 'Lobby Reset';
    if (slotInd1) slotInd1.classList.remove('active');
    if (slotInd2) slotInd2.classList.remove('active');
    if (slotInd3) slotInd3.classList.remove('active');

    if (lobbyStatusMsg) {
      lobbyStatusMsg.textContent = 'Lobby was reset by the facilitator. Tap below to join the session.';
    }
    if (lobbyActionBox) lobbyActionBox.style.display = 'none';
    if (lobbyRejoinBox) lobbyRejoinBox.style.display = 'block';
  });

  // --- Game State Broadcast ---
  socket.on('game-state', (state) => {
    latestState = state;
    if (state.settings) settings = state.settings;
    if (state.assignedSlot) {
      mySlot = state.assignedSlot;
      isQueued = false;
      isPendingLateJoin = false;
    }
    if (state.isQueued) {
      isQueued = true;
      isPendingLateJoin = false;
    }

    updateFromState(state);
  });

  // --- Main State Visualizer ---
  function updateFromState(state) {
    if (!state) return;

    // 1. Update Happiness
    if (vitalScoreEl) {
      vitalScoreEl.textContent = `${state.happiness}/10`;
    }

    // 1B. If 3rd player is choosing whether to join mid-game, keep modal open and don't render empty dilemma
    if (isPendingLateJoin && !mySlot && !isQueued) {
      showMidGameModal(true);
      return;
    }

    // 2. Queue View (Player 4+)
    if (isQueued) {
      showView(viewQueue);
      if (queuePositionEl) {
        queuePositionEl.textContent = `#${state.queuePosition || 1}`;
      }
      if (queueMessageEl && settings.queueMessage) {
        queueMessageEl.textContent = settings.queueMessage.replace('{pos}', state.queuePosition || 1);
      }
      return;
    }

    // 2B. Inactivity Ended View
    if (state.status === 'inactivity-ended') {
      hideInactivityModal();
      showView(viewInactivityEnded);
      return;
    }

    // 3. Lobby View (Status: lobby or ready)
    if (state.status === 'lobby' || state.status === 'ready') {
      showView(viewLobby);

      if (lobbySlotBadge) {
        lobbySlotBadge.textContent = `Assigned: Player ${mySlot || 1}`;
      }

      // Update slot indicators
      const count = state.activePlayersCount || 1;
      if (slotInd1) slotInd1.classList.toggle('active', count >= 1);
      if (slotInd2) slotInd2.classList.toggle('active', count >= 2);
      if (slotInd3) slotInd3.classList.toggle('active', count >= 3);

      if (lobbyStatusMsg) {
        if (state.status === 'ready') {
          lobbyStatusMsg.textContent = settings.lobbyReady || 'Session is ready to begin! Click Start Game to start.';
        } else {
          const templ = settings.lobbyWaiting || 'Waiting for co-custodians ({count}/3 connected)...';
          lobbyStatusMsg.textContent = templ.replace('{count}', count);
        }
      }

      // Show Start Button if ready (>= 2 players connected)
      if (lobbyActionBox) {
        lobbyActionBox.style.display = (state.status === 'ready') ? 'block' : 'none';
      }
      return;
    }

    // 4. Active Dilemma View
    if (state.status === 'active') {
      showView(viewDilemma);

      if (dilemmaIndexLabel) {
        dilemmaIndexLabel.textContent = `DIRECTIVE 0${(state.currentDilemmaIndex || 0) + 1} OF 0${state.totalDilemmas || 5}`;
      }

      if (dilemmaTitle) {
        dilemmaTitle.textContent = state.currentDilemmaTitle || 'Evaluating Scenario...';
      }

      if (perspectiveTitle) {
        perspectiveTitle.textContent = state.myPerspectiveTitle || `PLAYER ${mySlot} PERSPECTIVE`;
      }

      if (perspectiveBody) {
        perspectiveBody.textContent = state.myPerspective || 'Awaiting transmission parameters...';
      }

      // Choices
      const choices = state.choices || [];
      const choiceA = choices.find(c => c.id === 'A') || { text: 'Option A' };
      const choiceB = choices.find(c => c.id === 'B') || { text: 'Option B' };

      if (choiceAText) choiceAText.textContent = choiceA.text;
      if (choiceBText) choiceBText.textContent = choiceB.text;

      // Handle lock-in state
      myVote = state.myVote || null;
      if (myVote) {
        btnChoiceA.disabled = true;
        btnChoiceB.disabled = true;

        btnChoiceA.classList.toggle('selected', myVote === 'A');
        btnChoiceA.classList.toggle('dimmed', myVote !== 'A');
        btnChoiceB.classList.toggle('selected', myVote === 'B');
        btnChoiceB.classList.toggle('dimmed', myVote !== 'B');

        if (voteSubmittedBanner) {
          voteSubmittedBanner.style.display = 'flex';
          if (voteLockedText && settings.voteLocked) {
            voteLockedText.textContent = settings.voteLocked;
          }
        }
      } else {
        btnChoiceA.disabled = false;
        btnChoiceB.disabled = false;
        btnChoiceA.classList.remove('selected', 'dimmed');
        btnChoiceB.classList.remove('selected', 'dimmed');
        if (voteSubmittedBanner) voteSubmittedBanner.style.display = 'none';
      }
      return;
    }

    // 5. Revealed View
    if (state.status === 'revealed' && state.result) {
      showView(viewReveal);

      const isConsensus = state.result.consensus;
      if (revealCard) {
        revealCard.className = 'card reveal-card ' + (isConsensus ? 'consensus' : 'discord');
      }

      if (revealTitle) {
        revealTitle.textContent = isConsensus ? 'CONSENSUS ACHIEVED' : 'ETHICAL DISCORD DETECTED';
      }

      if (revealMessage) {
        revealMessage.textContent = state.result.message || (isConsensus ? settings.unanimousFeedback : settings.splitFeedback);
      }

      // Breakdown
      const votes = state.result.votes || {};
      formatVoteBreakdown(bd1, votes['1']);
      formatVoteBreakdown(bd2, votes['2']);
      formatVoteBreakdown(bd3, votes['3']);

      // 6-second auto-advance progress animation
      startRevealProgressBar(6);
      return;
    }

    // 6. Completed View
    if (state.status === 'completed') {
      showView(viewCompleted);
      if (completedText && settings.sessionCompleted) {
        completedText.textContent = settings.sessionCompleted;
      }
    }
  }

  function formatVoteBreakdown(el, vote) {
    if (!el) return;
    if (vote === 'A') {
      el.textContent = 'Choice A';
      el.className = 'breakdown-choice choice-a';
    } else if (vote === 'B') {
      el.textContent = 'Choice B';
      el.className = 'breakdown-choice choice-b';
    } else {
      el.textContent = 'No Vote';
      el.className = 'breakdown-choice';
    }
  }

  function startRevealProgressBar(seconds = 6) {
    if (revealProgressInterval) clearInterval(revealProgressInterval);

    const startTime = Date.now();
    const durationMs = seconds * 1000;

    revealProgressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.max(0, 1 - (elapsed / durationMs)) * 100;
      if (revealProgress) {
        revealProgress.style.width = `${progress}%`;
      }
      if (elapsed >= durationMs) {
        clearInterval(revealProgressInterval);
      }
    }, 100);
  }

  // --- Voting Handlers ---
  function submitChoice(choice) {
    if (myVote || !latestState || latestState.status !== 'active') return;

    myVote = choice;
    btnChoiceA.disabled = true;
    btnChoiceB.disabled = true;

    if (choice === 'A') {
      btnChoiceA.classList.add('selected');
      btnChoiceB.classList.add('dimmed');
    } else {
      btnChoiceB.classList.add('selected');
      btnChoiceA.classList.add('dimmed');
    }

    if (voteSubmittedBanner) voteSubmittedBanner.style.display = 'flex';

    // Haptic feedback for touch devices
    if (navigator.vibrate) navigator.vibrate(40);

    socket.emit('cast-vote', { choice });
  }

  btnChoiceA.addEventListener('click', () => submitChoice('A'));
  btnChoiceB.addEventListener('click', () => submitChoice('B'));

  // --- Lobby Manual Start & Rejoin ---
  if (btnStartNow) {
    btnStartNow.addEventListener('click', () => {
      socket.emit('player-start');
    });
  }

  if (btnRejoinLobby) {
    btnRejoinLobby.addEventListener('click', () => {
      lobbyRejoinBox.style.display = 'none';
      socket.emit('join-game');
    });
  }

  // --- Late 3rd Player Joining Handlers ---
  function handleOfferLateJoin() {
    isPendingLateJoin = true;
    if (midGameDesc) {
      midGameDesc.textContent = 'Two players are already at the table.';
    }
    showMidGameModal(true);
  }

  socket.on('offer-late-join', handleOfferLateJoin);
  socket.on('mid-game-prompt', handleOfferLateJoin);

  if (btnJoinCurrent) {
    btnJoinCurrent.addEventListener('click', () => {
      isPendingLateJoin = false;
      showMidGameModal(false);
      socket.emit('accept-late-join');
    });
  }

  if (btnWaitNext) {
    btnWaitNext.addEventListener('click', () => {
      isPendingLateJoin = false;
      showMidGameModal(false);
      socket.emit('decline-late-join');
    });
  }

  // --- Return to Lobby from Session Expired Screen ---
  if (btnReturnLobby) {
    btnReturnLobby.addEventListener('click', () => {
      socket.emit('return-to-lobby');
      if (!mySlot) {
        socket.emit('join-game');
      }
      showView(viewLobby);
    });
  }

  socket.on('session-inactivity-ended', () => {
    hideInactivityModal();
    showView(viewInactivityEnded);
  });

  // --- Inactivity Timeout (30s Idle + 6s Warning) ---
  // Waiting room / queued players NEVER receive or show inactivity warnings
  socket.on('inactivity-warning', (data) => {
    if (isQueued) return;
    showInactivityModal(data.seconds || 6);
  });

  socket.on('inactivity-status', (data) => {
    if (isQueued) return;
    if (data && data.warning) {
      const remainingSeconds = typeof data.remainingSeconds === 'number' ? data.remainingSeconds : 6;
      if (modalInactivity && !modalInactivity.classList.contains('active')) {
        showInactivityModal(remainingSeconds);
      } else {
        updateTimerVisuals(remainingSeconds);
      }
    } else {
      hideInactivityModal();
    }
  });

  socket.on('inactivity-cleared', () => {
    hideInactivityModal();
  });

  function showInactivityModal(seconds) {
    if (modalInactivity) modalInactivity.classList.add('active');

    let remaining = seconds;
    updateTimerVisuals(remaining);

    if (inactivityInterval) clearInterval(inactivityInterval);
    inactivityInterval = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      updateTimerVisuals(remaining);
      if (remaining <= 0) {
        clearInterval(inactivityInterval);
        inactivityInterval = null;
      }
    }, 1000);
  }

  function updateTimerVisuals(remainingSeconds) {
    if (inactivityCountdown) inactivityCountdown.textContent = `${remainingSeconds}s`;
    if (btnImHere) btnImHere.textContent = `Yes, Keep Playing (${remainingSeconds}s remaining)`;
    const extendBtn = document.getElementById('extend-timer-btn') || btnExtendTime;
    if (extendBtn) {
      extendBtn.innerText = `⏳ Extend Time (${remainingSeconds}s)`;
      extendBtn.classList.add('warning-active');
    }
  }

  function hideInactivityModal() {
    if (modalInactivity) modalInactivity.classList.remove('active');
    if (inactivityInterval) {
      clearInterval(inactivityInterval);
      inactivityInterval = null;
    }
    const extendBtn = document.getElementById('extend-timer-btn') || btnExtendTime;
    if (extendBtn) {
      extendBtn.innerText = "⏳ Extend Time";
      extendBtn.classList.remove('warning-active');
      extendBtn.style.borderColor = '';
      extendBtn.style.color = '';
    }
    if (btnImHere) {
      btnImHere.textContent = 'Yes, I am here! (Keep Playing)';
    }
  }

  // User confirms presence
  btnImHere.addEventListener('click', () => {
    hideInactivityModal();
    socket.emit('extend-time');
  });

  // Persistent Extend Time Button in Top Corner
  btnExtendTime.addEventListener('click', () => {
    socket.emit('extend-time');
    // Visual feedback on button
    btnExtendTime.style.borderColor = 'var(--happy-green)';
    btnExtendTime.style.color = 'var(--happy-green)';
    setTimeout(() => {
      if (!modalInactivity.classList.contains('active')) {
        btnExtendTime.style.borderColor = '';
        btnExtendTime.style.color = '';
      }
    }, 1000);
  });

  // Happiness event listener for vital HUD
  socket.on('happiness-update', (data) => {
    if (vitalScoreEl) vitalScoreEl.textContent = `${data.happiness}/10`;
  });

})();
