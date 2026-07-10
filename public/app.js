import {
  calculateGameResults,
  calculateStandings,
  createMatchups,
  generateGamePlan,
  getMatchupParticipants,
  getRoundsMissingTeamPairs,
  matchResultKey,
  normalizeRankPoints,
  normalizePlayMode,
  PLAY_MODES,
} from './scheduler.js';
import {
  addGame,
  addTeam,
  createEmptyState,
  createGame,
  createTeam,
  deserializeState,
  normalizeState,
  removeGame,
  removeTeam,
  serializeState,
  splitMembers,
  updateGame,
  updateTeam
} from './state.js';

const storageKey = 'olympiade-organizator:v1';

let state = loadState();
let installPrompt = null;

const elements = {
  teamForm: document.querySelector('#team-form'),
  teamName: document.querySelector('#team-name'),
  teamMembers: document.querySelector('#team-members'),
  teamsList: document.querySelector('#teams-list'),
  teamCount: document.querySelector('#team-count'),
  gameForm: document.querySelector('#game-form'),
  gameName: document.querySelector('#game-name'),
  gameNotes: document.querySelector('#game-notes'),
  gamePlayMode: document.querySelector('#game-play-mode'),
  gamesList: document.querySelector('#games-list'),
  gameCount: document.querySelector('#game-count'),
  generatePlan: document.querySelector('#generate-plan'),
  roundsList: document.querySelector('#rounds-list'),
  standingsList: document.querySelector('#standings-list'),
  planWarning: document.querySelector('#plan-warning'),
  installButton: document.querySelector('#install-button'),
  connectionStatus: document.querySelector('#connection-status'),
  storageStatus: document.querySelector('#storage-status'),
  exportData: document.querySelector('#export-data'),
  importData: document.querySelector('#import-data'),
  importFile: document.querySelector('#import-file'),
  resetData: document.querySelector('#reset-data'),
  teamTemplate: document.querySelector('#team-template'),
  gameTemplate: document.querySelector('#game-template')
};

elements.teamForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = elements.teamName.value.trim();

  if (!name) {
    return;
  }

  state = addTeam(state, createTeam(name, elements.teamMembers.value));

  elements.teamForm.reset();
  persistAndRender('Team added.');
});

elements.gameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = elements.gameName.value.trim();

  if (!name) {
    return;
  }

  state = addGame(state, createGame(name, elements.gameNotes.value, elements.gamePlayMode.value));

  elements.gameForm.reset();
  persistAndRender('Game added.');
});

elements.generatePlan.addEventListener('click', () => {
  const hasExistingPlan = Boolean(state.plan);

  if (hasExistingPlan && !window.confirm('Replace the existing game plan? Existing results will be reset.')) {
    return;
  }

  state.plan = generateGamePlan(state.teams, state.games);
  persistAndRender(hasExistingPlan ? 'Game plan replaced.' : 'Game plan generated.');
});

elements.exportData.addEventListener('click', () => {
  const blob = new Blob([serializeState(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `olympiade-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

elements.importData.addEventListener('click', () => {
  elements.importFile.click();
});

elements.importFile.addEventListener('change', async () => {
  const [file] = elements.importFile.files;

  if (!file) {
    return;
  }

  state = deserializeState(await file.text());
  elements.importFile.value = '';
  persistAndRender('Data imported.');
});

elements.resetData.addEventListener('click', () => {
  if (!window.confirm('Delete all teams, games, rounds, and scores from this device?')) {
    return;
  }

  state = createEmptyState();
  persistAndRender('All local data removed.');
});

elements.installButton.addEventListener('click', async () => {
  if (!installPrompt) {
    return;
  }

  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  elements.installButton.classList.add('hidden');
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  elements.installButton.classList.remove('hidden');
});

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

registerServiceWorker();
render();

function render() {
  renderTeams();
  renderGames();
  renderPlan();
  renderStandings();
  updateConnectionStatus();
  elements.generatePlan.disabled = state.teams.length === 0 || state.games.length === 0;
  elements.generatePlan.textContent = state.plan ? 'Regenerate rounds' : 'Generate rounds';
}

function renderTeams() {
  elements.teamCount.textContent = `${state.teams.length} ${pluralize('team', state.teams.length)}`;
  elements.teamsList.innerHTML = '';

  if (state.teams.length === 0) {
    elements.teamsList.textContent = 'No teams yet.';
    elements.teamsList.classList.add('empty-list');
    return;
  }

  elements.teamsList.classList.remove('empty-list');

  state.teams.forEach((team) => {
    const card = elements.teamTemplate.content.firstElementChild.cloneNode(true);
    const nameInput = card.querySelector('[data-field="name"]');
    const membersInput = card.querySelector('[data-field="members"]');
    const removeButton = card.querySelector('[data-action="remove-team"]');

    nameInput.value = team.name;
    membersInput.value = team.members.join('\n');

    nameInput.addEventListener('input', () => {
      state = updateTeam(state, team.id, { name: nameInput.value });
      persistAndRender();
    });

    membersInput.addEventListener('input', () => {
      state = updateTeam(state, team.id, { members: splitMembers(membersInput.value) });
      persistAndRender();
    });

    removeButton.addEventListener('click', () => {
      state = removeTeam(state, team.id);
      persistAndRender('Team removed.');
    });

    elements.teamsList.append(card);
  });
}

function renderGames() {
  elements.gameCount.textContent = `${state.games.length} ${pluralize('game', state.games.length)}`;
  elements.gamesList.innerHTML = '';

  if (state.games.length === 0) {
    elements.gamesList.textContent = 'No games yet.';
    elements.gamesList.classList.add('empty-list');
    return;
  }

  elements.gamesList.classList.remove('empty-list');

  state.games.forEach((game) => {
    const card = elements.gameTemplate.content.firstElementChild.cloneNode(true);
    const nameInput = card.querySelector('[data-field="name"]');
    const playModeInput = card.querySelector('[data-field="playMode"]');
    const notesInput = card.querySelector('[data-field="notes"]');
    const removeButton = card.querySelector('[data-action="remove-game"]');

    nameInput.value = game.name;
    playModeInput.value = normalizePlayMode(game.playMode);
    notesInput.value = game.notes;

    nameInput.addEventListener('input', () => {
      state = updateGame(state, game.id, { name: nameInput.value });
      persistAndRender();
    });

    notesInput.addEventListener('input', () => {
      state = updateGame(state, game.id, { notes: notesInput.value });
      persistAndRender();
    });

    playModeInput.addEventListener('change', () => {
      state = updateGame(state, game.id, { playMode: playModeInput.value });
      persistAndRender();
    });

    removeButton.addEventListener('click', () => {
      state = removeGame(state, game.id);
      persistAndRender('Game removed.');
    });

    elements.gamesList.append(card);
  });
}

function renderPlan() {
  elements.roundsList.innerHTML = '';
  elements.planWarning.classList.add('hidden');

  if (!state.plan) {
    elements.roundsList.textContent = 'Add at least one team and one game to create a plan.';
    elements.roundsList.classList.add('empty-list');
    return;
  }

  state.plan.matchResults ??= {};
  state.plan.results ??= {};

  const warning = getPlanWarning();

  if (warning) {
    elements.planWarning.textContent = warning;
    elements.planWarning.classList.remove('hidden');
  }

  elements.roundsList.classList.remove('empty-list');

  const scoringCard = createScoringCard();
  elements.roundsList.append(scoringCard);

  state.plan.rounds.forEach((round, roundIndex) => {
    const game = findById(state.games, round.gameId);
    const playMode = normalizePlayMode(round.playMode);
    const roundCard = document.createElement('article');
    roundCard.className = 'round-card';
    roundCard.innerHTML = `
      <div class="round-header">
        <div>
          <p class="eyebrow">${escapeHtml(round.name)}</p>
          <h3>${escapeHtml(game?.name ?? 'Removed game')}</h3>
          ${game?.notes ? `<p class="hint">${escapeHtml(game.notes)}</p>` : ''}
        </div>
        <span class="count-pill">${formatPlayMode(playMode)}</span>
      </div>
      <div class="matchups"></div>
      <section class="game-result">
        <h4>Game result</h4>
        <p class="hint">${playMode === PLAY_MODES.KNOCKOUT ? 'Choose winners as the bracket unlocks. The app calculates the knockout ranking points.' : 'Choose a winner for every matchup. The app calculates wins, losses, and ranking points.'}</p>
        <div class="team-results"></div>
      </section>
    `;

    const matchups = roundCard.querySelector('.matchups');
    const results = roundCard.querySelector('.team-results');
    const roundMatchups = round.matchups?.length
      ? round.matchups
      : createMatchups(round.teamIds, roundIndex);
    const gameResults = calculateGameResults(state.plan, round.gameId);

    let currentBracketRound = null;

    roundMatchups.forEach((matchup, matchupIndex) => {
      const participants = getMatchupParticipants(state.teams, matchup, round, state.plan.matchResults, round.gameId);

      if (playMode === PLAY_MODES.KNOCKOUT && currentBracketRound !== matchup.bracketRound) {
        currentBracketRound = matchup.bracketRound;
        const heading = document.createElement('h4');
        heading.textContent = formatBracketRound(matchup.bracketRound, roundMatchups);
        matchups.append(heading);
      }

      const matchupCard = document.createElement('section');
      matchupCard.className = 'matchup-card';
      matchupCard.innerHTML = `
        <div>
          <p class="eyebrow">Match ${matchupIndex + 1}</p>
          <h4>${formatMatchupTitle(participants, matchup)}</h4>
          ${participants.length ? createParticipantMarkup(participants) : ''}
        </div>
        <div class="team-results"></div>
      `;

      const matchResults = matchupCard.querySelector('.team-results');
      const key = matchResultKey(round.gameId, matchup.id);
      const winnerTeamId = state.plan.matchResults?.[key]?.winnerTeamId ?? '';

      if (participants.length > 1) {
        const row = document.createElement('label');
        row.className = 'team-score-row';
        row.innerHTML = `
          Winner
          <select aria-label="Winner for match ${matchupIndex + 1}">
            <option value="">Not played</option>
            ${participants.map((participant) => `<option value="${escapeHtml(participant.teamId)}">${escapeHtml(participant.name)}</option>`).join('')}
          </select>
        `;

        const select = row.querySelector('select');
        select.value = winnerTeamId;
        select.addEventListener('change', () => {
          if (select.value) {
            state.plan.matchResults[key] = { winnerTeamId: select.value };
          } else {
            delete state.plan.matchResults[key];
          }

          persistAndRender();
        });

        matchResults.append(row);
      } else {
        const note = document.createElement('p');
        note.className = 'hint';
        note.textContent = participants.length === 1 ? 'Bye - advances automatically.' : 'Waiting for previous winner.';
        matchResults.append(note);
      }

      matchups.append(matchupCard);
    });

    if (gameResults.some((gameResult) => gameResult.hasResult)) {
      gameResults.forEach((gameResult) => {
        const team = findById(state.teams, gameResult.teamId);
        const row = document.createElement('div');
        row.className = 'team-score-row';
        row.innerHTML = `
          <span><strong>${formatRank(gameResult.rank)} ${escapeHtml(team?.name ?? 'Removed team')}</strong></span>
          <span>${gameResult.wins}-${gameResult.losses} / ${gameResult.points.toLocaleString()} pts</span>
        `;
        results.append(row);
      });
    } else {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Choose matchup winners to calculate this game result.';
      results.append(empty);
    }


    elements.roundsList.append(roundCard);
  });
}

function createScoringCard() {
  const rankPoints = normalizeRankPoints(state.plan.rankPoints, state.plan.teamIds.length);
  state.plan.rankPoints = rankPoints;

  const card = document.createElement('article');
  card.className = 'round-card';
  card.innerHTML = `
    <div class="round-header">
      <div>
        <p class="eyebrow">Scoring</p>
        <h3>Ranking points</h3>
      </div>
      <span class="count-pill">Editable</span>
    </div>
    <p class="hint">Choose winners for every matchup. The app totals wins and losses, ranks teams automatically, and adds these ranking points to the standings.</p>
    <div class="rank-points"></div>
  `;

  const rankPointsContainer = card.querySelector('.rank-points');
  rankPoints.forEach((points, index) => {
    const label = document.createElement('label');
    label.innerHTML = `
      ${formatRank(index + 1)}
      <input inputmode="decimal" aria-label="Points for ${formatRank(index + 1)} place" value="${points}">
    `;

    const input = label.querySelector('input');
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      state.plan.rankPoints[index] = Number.isFinite(parsed) ? parsed : 0;
      persistAndRender();
    });

    rankPointsContainer.append(label);
  });

  return card;
}

function renderStandings() {
  elements.standingsList.innerHTML = '';
  const standings = calculateStandings(state.teams, state.plan);

  if (standings.length === 0) {
    elements.standingsList.textContent = 'Scores appear after you generate a plan.';
    elements.standingsList.classList.add('empty-list');
    return;
  }

  elements.standingsList.classList.remove('empty-list');

  standings.forEach((standing, index) => {
    const row = document.createElement('div');
    row.className = 'standing-row';
    row.innerHTML = `
      <span><strong>${index + 1}. ${escapeHtml(standing.name)}</strong></span>
      <span>${standing.total.toLocaleString()}</span>
    `;
    elements.standingsList.append(row);
  });
}

function persistAndRender(message) {
  localStorage.setItem(storageKey, JSON.stringify(state));

  if (message) {
    elements.storageStatus.textContent = `${message} Saved locally on this device.`;
  }

  render();
}

function loadState() {
  const rawState = localStorage.getItem(storageKey);

  if (!rawState) {
    return createEmptyState();
  }

  return normalizeState(JSON.parse(rawState));
}

function getPlanWarning() {
  const plannedTeamIds = new Set(state.plan.teamIds);
  const plannedGameIds = new Set(state.plan.gameIds);

  if (state.teams.some((team) => !plannedTeamIds.has(team.id))) {
    return 'Some teams were added after this plan was generated. Regenerate rounds to include them.';
  }

  if (state.games.some((game) => !plannedGameIds.has(game.id))) {
    return 'Some games were added after this plan was generated. Regenerate rounds to include them.';
  }

  if (state.games.some((game) => plannedGameIds.has(game.id) && normalizePlayMode(game.playMode) !== normalizePlayMode(state.plan.rounds.find((round) => round.gameId === game.id)?.playMode))) {
    return 'A game play mode changed after this plan was generated. Regenerate rounds to apply it.';
  }

  const roundsMissingPairs = getRoundsMissingTeamPairs(state.plan.teamIds, state.plan.rounds);

  if (roundsMissingPairs.length > 0) {
    const firstRoundWithMissingPairs = roundsMissingPairs[0];
    const game = findById(state.games, firstRoundWithMissingPairs.gameId);
    const examples = firstRoundWithMissingPairs.missingPairs
      .slice(0, 3)
      .map((pair) => pair.map((teamId) => findById(state.teams, teamId)?.name ?? 'Removed team').join(' vs '))
      .join(', ');

    return `${game?.name ?? 'A game'} does not include every team-vs-team matchup yet. Regenerate the plan. Missing: ${examples}${firstRoundWithMissingPairs.missingPairs.length > 3 ? ', ...' : ''}`;
  }

  return '';
}

function findById(items, id) {
  return items.find((item) => item.id === id);
}

function pluralize(word, count) {
  return count === 1 ? word : `${word}s`;
}

function formatRank(rank) {
  const suffix = rank % 10 === 1 && rank % 100 !== 11
    ? 'st'
    : rank % 10 === 2 && rank % 100 !== 12
      ? 'nd'
      : rank % 10 === 3 && rank % 100 !== 13
        ? 'rd'
        : 'th';

  return `${rank}${suffix}`;
}

function formatPlayMode(playMode) {
  return playMode === PLAY_MODES.KNOCKOUT ? 'Knockout' : 'Everyone vs everyone';
}

function formatBracketRound(bracketRound, matchups) {
  const highestRound = Math.max(...matchups.map((matchup) => matchup.bracketRound ?? 1));

  if (bracketRound === highestRound) {
    return 'Final';
  }

  if (bracketRound === highestRound - 1) {
    return 'Semi-final';
  }

  return `Knockout round ${bracketRound}`;
}

function formatMatchupTitle(participants, matchup) {
  if (participants.length === 0) {
    return 'Waiting for previous winners';
  }

  if (participants.length === 1) {
    return `${escapeHtml(participants[0].name)} has a bye`;
  }

  return participants.map((participant) => escapeHtml(participant.name)).join(' vs ');
}

function createParticipantMarkup(participants) {
  return `
    <div class="matchup-participants">
      ${participants.map((participant) => `
        <div>
          <strong>${escapeHtml(participant.name)}</strong>
          <small>${participant.members.length ? escapeHtml(participant.members.join(', ')) : 'No members listed'}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function updateConnectionStatus() {
  elements.connectionStatus.textContent = navigator.onLine ? 'Online' : 'Offline ready';
  elements.connectionStatus.classList.toggle('offline', !navigator.onLine);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    elements.connectionStatus.textContent = 'Offline cache unavailable';
    return;
  }

  let isRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) {
      return;
    }

    isRefreshing = true;
    window.location.reload();
  });

  try {
    await navigator.serviceWorker.register('./service-worker.js');
    elements.connectionStatus.classList.add('ready');
  } catch (error) {
    elements.connectionStatus.textContent = 'Offline cache failed';
    console.error(error);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return entities[character];
  });
}
