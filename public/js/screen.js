// ============================================================================
// Autonomy Baby - Participant Screen Controller
// Exhibition Theme: "Reimagining Autonomy"
// Handles real-time SSE updates, subtle dilemma rendering, and voting
// ============================================================================

(function () {
  const urlParams = new URLSearchParams(window.location.search);
  let screenId = urlParams.get('id') || '1';
  if (!['1', '2', '3'].includes(screenId)) {
    screenId = '1';
  }

  // DOM Elements
  const caseIdEl = document.getElementById('case-id');
  const caseContextEl = document.getElementById('case-context');
  const perspectiveTextEl = document.getElementById('perspective-text');
  
  const choiceBtnA = document.getElementById('choice-a');
  const choiceBtnB = document.getElementById('choice-b');
  const choiceLabelA = document.getElementById('choice-a-label');
  const choiceSubtextA = document.getElementById('choice-a-subtext');
  const choiceLabelB = document.getElementById('choice-b-label');
  const choiceSubtextB = document.getElementById('choice-b-subtext');

  const awaitingBanner = document.getElementById('awaiting-banner');
  const revealArea = document.getElementById('reveal-area');
  const revealTitle = document.getElementById('reveal-title');
  const revealSummary = document.getElementById('reveal-summary');
  const voteMatrix = document.getElementById('vote-matrix');

  const vitalMoodEl = document.getElementById('vital-mood');
  const vitalRing = document.getElementById('vital-ring');
  const stationMarker = document.getElementById('station-marker');

  let currentDilemma = null;
  let myVote = null;
  let lastRevealedRound = null;

  // Station Roman Numeral marker
  const romanNumerals = { '1': 'I', '2': 'II', '3': 'III' };
  if (stationMarker) {
    stationMarker.textContent = `TERMINAL ${romanNumerals[screenId] || 'I'} // BIO-ETHICS INTERFACE`;
  }

  function getMoodInfo(happiness) {
    if (happiness <= 2) {
      return { mood: 'distressed', text: 'Critical Distress', color: 'var(--distress-red)' };
    } else if (happiness <= 4) {
      return { mood: 'distressed', text: 'Unsettled Agitation', color: 'var(--warning-amber)' };
    } else if (happiness === 5) {
      return { mood: 'neutral', text: 'Neutral Equilibrium', color: 'var(--neutral-blue)' };
    } else if (happiness <= 7) {
      return { mood: 'content', text: 'Receptive Calm', color: 'var(--accent-cyan)' };
    } else {
      return { mood: 'content', text: 'Harmonious Resonance', color: 'var(--happy-green)' };
    }
  }

  function updateVitalMood(happiness) {
    const info = getMoodInfo(happiness);
    document.body.setAttribute('data-mood', info.mood);
    if (vitalMoodEl) vitalMoodEl.textContent = `${info.text} (${happiness}/10)`;
    if (vitalRing) {
      vitalRing.style.background = info.color;
      vitalRing.style.color = info.color;
    }
  }

  function renderDilemma(dilemma) {
    if (!dilemma) return;
    currentDilemma = dilemma;

    caseIdEl.textContent = dilemma.title || 'Directive Under Review';
    caseContextEl.textContent = dilemma.context || '';

    // Screen-specific perspective
    let perspective = '';
    if (screenId === '1') perspective = dilemma.screen1;
    else if (screenId === '2') perspective = dilemma.screen2;
    else if (screenId === '3') perspective = dilemma.screen3;

    perspectiveTextEl.textContent = perspective || dilemma.context || '';

    // Options
    if (dilemma.optionA) {
      choiceLabelA.textContent = dilemma.optionA.label || 'Option A';
      choiceSubtextA.textContent = dilemma.optionA.subtext || '';
    }
    if (dilemma.optionB) {
      choiceLabelB.textContent = dilemma.optionB.label || 'Option B';
      choiceSubtextB.textContent = dilemma.optionB.subtext || '';
    }
  }

  const countdownBox = document.getElementById('countdown-box');
  const countdownSecText = document.getElementById('countdown-sec-text');
  const countdownBar = document.getElementById('countdown-bar');
  let countdownTimer = null;

  function updateCountdown(autoAdvanceAt, duration) {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    if (!autoAdvanceAt) {
      if (countdownBox) countdownBox.style.display = 'none';
      return;
    }

    if (countdownBox) countdownBox.style.display = 'flex';

    function tick() {
      const now = Date.now();
      const remainingMs = autoAdvanceAt - now;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      const totalSec = duration || 8;
      const percent = Math.max(0, Math.min(100, (remainingMs / (totalSec * 1000)) * 100));

      if (countdownSecText) countdownSecText.textContent = `${remainingSec}s`;
      if (countdownBar) countdownBar.style.width = `${percent}%`;

      if (remainingMs <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }

    tick();
    countdownTimer = setInterval(tick, 100);
  }

  function applyVotingState(state) {
    const hasVoted = state.votes && state.votes[screenId] !== null;
    myVote = hasVoted ? state.votes[screenId] : null;

    if (state.status === 'voting') {
      revealArea.style.display = 'none';
      updateCountdown(null);

      if (hasVoted) {
        choiceBtnA.disabled = true;
        choiceBtnB.disabled = true;

        if (myVote === 'A') {
          choiceBtnA.classList.add('selected');
          choiceBtnA.classList.remove('dimmed');
          choiceBtnB.classList.add('dimmed');
          choiceBtnB.classList.remove('selected');
        } else if (myVote === 'B') {
          choiceBtnB.classList.add('selected');
          choiceBtnB.classList.remove('dimmed');
          choiceBtnA.classList.add('dimmed');
          choiceBtnA.classList.remove('selected');
        }
        awaitingBanner.style.display = 'flex';
      } else {
        choiceBtnA.disabled = false;
        choiceBtnB.disabled = false;
        choiceBtnA.classList.remove('selected', 'dimmed');
        choiceBtnB.classList.remove('selected', 'dimmed');
        awaitingBanner.style.display = 'none';
      }
    } else if (state.status === 'revealed' && state.result) {
      awaitingBanner.style.display = 'none';
      choiceBtnA.disabled = true;
      choiceBtnB.disabled = true;

      showReveal(state.result);
      updateCountdown(state.autoAdvanceAt, state.autoAdvanceDuration);
    }
  }

  function showReveal(result) {
    revealArea.style.display = 'block';

    const isConsensus = result.consensus;
    revealArea.className = 'reveal-modal ' + (isConsensus ? 'consensus' : 'discord');

    const votes = result.votes || {};
    const hasUnanswered = Object.values(votes).some(v => v === null);

    if (isConsensus) {
      revealTitle.textContent = 'CONSENSUS ACHIEVED';
      const choiceLabel = result.unanimousChoice === 'A' ? 
        (currentDilemma?.optionA?.label || 'Option A') : 
        (currentDilemma?.optionB?.label || 'Option B');

      if (hasUnanswered) {
        revealSummary.textContent = `All active custodians agreed on "${choiceLabel}". Non-answering terminals were set aside. The biological system stabilizes (+1 Vital Harmony).`;
      } else {
        revealSummary.textContent = `All three custodians aligned on "${choiceLabel}". The biological system stabilizes and flourishes (+1 Vital Harmony).`;
      }
      
      if (lastRevealedRound !== result.dilemmaId + '_revealed') {
        window.soundEngine.playConsensusChime();
        lastRevealedRound = result.dilemmaId + '_revealed';
      }
    } else {
      revealTitle.textContent = 'DIVERGENCE DETECTED — CONSENSUS FAILED';
      revealSummary.textContent = 'Custodians reached conflicting determinations. Without collective alignment, biological destabilization accelerates (-1 Vital Harmony).';
      
      if (lastRevealedRound !== result.dilemmaId + '_revealed') {
        window.soundEngine.playDiscordBuzz();
        lastRevealedRound = result.dilemmaId + '_revealed';
      }
    }

    function formatVote(v) {
      if (v === 'A') return '<span class="vote-pick pick-a">Choice A</span>';
      if (v === 'B') return '<span class="vote-pick pick-b">Choice B</span>';
      return '<span class="vote-pick pick-none">No Answer (Uncounted)</span>';
    }

    // Render vote distribution
    voteMatrix.innerHTML = `
      <div class="vote-item">
        <span class="vote-custodian">Custodian I</span>
        ${formatVote(votes['1'])}
      </div>
      <div class="vote-item">
        <span class="vote-custodian">Custodian II</span>
        ${formatVote(votes['2'])}
      </div>
      <div class="vote-item">
        <span class="vote-custodian">Custodian III</span>
        ${formatVote(votes['3'])}
      </div>
    `;
  }

  async function submitVote(choice) {
    window.soundEngine.playVocalTone(5);

    try {
      choiceBtnA.disabled = true;
      choiceBtnB.disabled = true;

      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenId, choice })
      });
      const data = await res.json();
      if (!data.success) {
        console.error('Vote failed:', data.error);
      }
    } catch (err) {
      console.error('Vote network error:', err);
    }
  }

  // Button Listeners
  choiceBtnA.addEventListener('click', () => submitVote('A'));
  choiceBtnB.addEventListener('click', () => submitVote('B'));

  // Connect SSE Stream
  function connectSSE() {
    const evtSource = new EventSource('/api/events');

    evtSource.onmessage = function (event) {
      try {
        const state = JSON.parse(event.data);
        updateVitalMood(state.happiness);
        renderDilemma(state.currentDilemma);
        applyVotingState(state);
      } catch (err) {
        console.error('Error handling SSE message:', err);
      }
    };

    evtSource.onerror = function () {
      console.warn('SSE connection lost. Reconnecting...');
    };
  }

  // Initial SSE activation
  connectSSE();
})();
