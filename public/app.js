import {
  calculateStandings,
  createMatchups,
  generateGamePlan,
  getRoundsMissingTeamPairs,
  normalizeRankPoints,
  resultKey
} from './scheduler.js';

const storageKey = 'olympiade-organizator:v1';

const initialState = {
  teams: [],
  games: [],
  plan: null
};

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

  state.teams.push({
    id: crypto.randomUUID(),
    name,
    members: splitLines(elements.teamMembers.value)
  });

  elements.teamForm.reset();
  persistAndRender('Team added.');
});

elements.gameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = elements.gameName.value.trim();

  if (!name) {
    return;
  }

  state.games.push({
    id: crypto.randomUUID(),
    name,
    notes: elements.gameNotes.value.trim()
  });

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
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
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

  const importedState = JSON.parse(await file.text());
  state = normalizeState(importedState);
  elements.importFile.value = '';
  persistAndRender('Data imported.');
});

elements.resetData.addEventListener('click', () => {
  if (!window.confirm('Delete all teams, games, rounds, and scores from this device?')) {
    return;
  }

  state = structuredClone(initialState);
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
      team.name = nameInput.value;
      persistAndRender();
    });

    membersInput.addEventListener('input', () => {
      team.members = splitLines(membersInput.value);
      persistAndRender();
    });

    removeButton.addEventListener('click', () => {
      state.teams = state.teams.filter((existingTeam) => existingTeam.id !== team.id);
      removeTeamFromPlan(team.id);
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
    const notesInput = card.querySelector('[data-field="notes"]');
    const removeButton = card.querySelector('[data-action="remove-game"]');

    nameInput.value = game.name;
    notesInput.value = game.notes;

    nameInput.addEventListener('input', () => {
      game.name = nameInput.value;
      persistAndRender();
    });

    notesInput.addEventListener('input', () => {
      game.notes = notesInput.value;
      persistAndRender();
    });

    removeButton.addEventListener('click', () => {
      state.games = state.games.filter((existingGame) => existingGame.id !== game.id);
      removeGameFromPlan(game.id);
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
    const roundCard = document.createElement('article');
    roundCard.className = 'round-card';
    roundCard.innerHTML = `
      <div class="round-header">
        <div>
          <p class="eyebrow">${escapeHtml(round.name)}</p>
          <h3>${escapeHtml(game?.name ?? 'Removed game')}</h3>
          ${game?.notes ? `<p class="hint">${escapeHtml(game.notes)}</p>` : ''}
        </div>
        <span class="count-pill">${round.teamIds.length} ${pluralize('team', round.teamIds.length)}</span>
      </div>
      <div class="matchups"></div>
      <section class="game-result">
        <h4>Game result</h4>
        <p class="hint">Enter the final ranking after all matchups for this game are done.</p>
        <div class="team-results"></div>
      </section>
    `;

    const matchups = roundCard.querySelector('.matchups');
    const results = roundCard.querySelector('.team-results');
    const roundMatchups = round.matchups?.length
      ? round.matchups
      : createMatchups(round.teamIds, roundIndex);

    roundMatchups.forEach((matchup, matchupIndex) => {
      const matchupCard = document.createElement('section');
      matchupCard.className = 'matchup-card';
      matchupCard.innerHTML = `
        <div>
          <p class="eyebrow">Match ${matchupIndex + 1}</p>
          <h4>${matchup.teamIds.map((teamId) => escapeHtml(findById(state.teams, teamId)?.name ?? 'Removed team')).join(' vs ')}</h4>
        </div>
      `;

      matchups.append(matchupCard);
    });

    round.teamIds.forEach((teamId) => {
      const team = findById(state.teams, teamId);
      const key = resultKey(round.gameId, teamId);
      const row = document.createElement('label');
      row.className = 'team-score-row';
      row.innerHTML = `
        <span>
          <strong>${escapeHtml(team?.name ?? 'Removed team')}</strong>
          ${team?.members?.length ? `<small class="team-members">${escapeHtml(team.members.join(', '))}</small>` : ''}
        </span>
        <select aria-label="Rank for ${escapeHtml(team?.name ?? 'team')}">
          <option value="">Rank</option>
          ${state.plan.teamIds.map((_, index) => `<option value="${index + 1}">${formatRank(index + 1)}</option>`).join('')}
        </select>
      `;

      const select = row.querySelector('select');
      select.value = state.plan.results?.[key]?.rank ?? '';
      select.addEventListener('change', () => {
        state.plan.results[key] = { rank: select.value };
        persistAndRender();
      });

      results.append(row);
    });

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
    <p class="hint">After each game, choose each team's rank. These point values are added to the standings.</p>
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
    return structuredClone(initialState);
  }

  return normalizeState(JSON.parse(rawState));
}

function normalizeState(candidate) {
  return {
    teams: Array.isArray(candidate?.teams)
      ? candidate.teams.map((team) => ({
          id: String(team.id ?? crypto.randomUUID()),
          name: String(team.name ?? ''),
          members: Array.isArray(team.members) ? team.members.map(String) : []
        }))
      : [],
    games: Array.isArray(candidate?.games)
      ? candidate.games.map((game) => ({
          id: String(game.id ?? crypto.randomUUID()),
          name: String(game.name ?? ''),
          notes: String(game.notes ?? '')
        }))
      : [],
    plan: candidate?.plan ?? null
  };
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

function removeTeamFromPlan(teamId) {
  if (!state.plan) {
    return;
  }

  state.plan.teamIds = state.plan.teamIds.filter((id) => id !== teamId);
  state.plan.rounds.forEach((round) => {
    round.teamIds = round.teamIds.filter((id) => id !== teamId);
    round.matchups = (round.matchups ?? []).map((matchup) => ({
      ...matchup,
      teamIds: matchup.teamIds.filter((id) => id !== teamId)
    })).filter((matchup) => matchup.teamIds.length > 0);
  });
  state.plan.rankPoints = normalizeRankPoints(state.plan.rankPoints, state.plan.teamIds.length);

  Object.keys(state.plan.results).forEach((key) => {
    if (key.endsWith(`:${teamId}`)) {
      delete state.plan.results[key];
    }
  });
}

function removeGameFromPlan(gameId) {
  if (!state.plan) {
    return;
  }

  state.plan.gameIds = state.plan.gameIds.filter((id) => id !== gameId);
  state.plan.rounds = state.plan.rounds.filter((round) => round.gameId !== gameId);

  Object.keys(state.plan.results).forEach((key) => {
    if (key.startsWith(`${gameId}:`)) {
      delete state.plan.results[key];
    }
  });
}

function splitLines(value) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
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
