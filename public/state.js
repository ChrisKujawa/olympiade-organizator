import { normalizePlayMode, normalizeRankPoints } from './scheduler.js';

export function createEmptyState() {
  return {
    teams: [],
    games: [],
    plan: null
  };
}

export function createTeam(name, membersInput = '', createId = createStateId) {
  return {
    id: createId(),
    name: String(name ?? '').trim(),
    members: splitMembers(membersInput)
  };
}

export function createGame(name, notes = '', playMode = undefined, createId = createStateId) {
  return {
    id: createId(),
    name: String(name ?? '').trim(),
    notes: String(notes ?? '').trim(),
    playMode: normalizePlayMode(playMode)
  };
}

export function addTeam(state, team) {
  return {
    ...state,
    teams: [...state.teams, team]
  };
}

export function addGame(state, game) {
  return {
    ...state,
    games: [...state.games, game]
  };
}

export function updateTeam(state, teamId, updates) {
  return {
    ...state,
    teams: state.teams.map((team) => team.id === teamId
      ? { ...team, ...updates }
      : team)
  };
}

export function updateGame(state, gameId, updates) {
  return {
    ...state,
    games: state.games.map((game) => game.id === gameId
      ? { ...game, ...updates, playMode: updates.playMode === undefined ? game.playMode : normalizePlayMode(updates.playMode) }
      : game)
  };
}

export function removeTeam(state, teamId) {
  return {
    ...state,
    teams: state.teams.filter((team) => team.id !== teamId),
    plan: removeTeamFromPlan(state.plan, teamId)
  };
}

export function removeGame(state, gameId) {
  return {
    ...state,
    games: state.games.filter((game) => game.id !== gameId),
    plan: removeGameFromPlan(state.plan, gameId)
  };
}

export function removeTeamFromPlan(plan, teamId) {
  if (!plan) {
    return null;
  }

  const nextPlan = clonePlan(plan);
  const matchResultKeysToDelete = new Set();

  nextPlan.rounds.forEach((round) => {
    (round.matchups ?? []).forEach((matchup) => {
      if ((matchup.teamIds ?? []).includes(teamId)) {
        matchResultKeysToDelete.add(`${round.gameId}:${matchup.id}`);
      }
    });
  });

  nextPlan.teamIds = nextPlan.teamIds.filter((id) => id !== teamId);
  nextPlan.rounds = nextPlan.rounds.map((round) => ({
    ...round,
    teamIds: round.teamIds.filter((id) => id !== teamId),
    matchups: (round.matchups ?? [])
      .map((matchup) => ({
        ...matchup,
        teamIds: (matchup.teamIds ?? []).filter((id) => id !== teamId)
      }))
      .filter((matchup) => matchup.teamIds.length > 0 || matchup.sourceMatchIds?.length)
  }));
  nextPlan.rankPoints = normalizeRankPoints(nextPlan.rankPoints, nextPlan.teamIds.length);

  Object.keys(nextPlan.results).forEach((key) => {
    if (key.endsWith(`:${teamId}`)) {
      delete nextPlan.results[key];
    }
  });

  Object.entries(nextPlan.matchResults).forEach(([key, result]) => {
    if (result.winnerTeamId === teamId || matchResultKeysToDelete.has(key)) {
      delete nextPlan.matchResults[key];
    }
  });

  return nextPlan;
}

export function removeGameFromPlan(plan, gameId) {
  if (!plan) {
    return null;
  }

  const nextPlan = clonePlan(plan);
  nextPlan.gameIds = nextPlan.gameIds.filter((id) => id !== gameId);
  nextPlan.rounds = nextPlan.rounds.filter((round) => round.gameId !== gameId);

  Object.keys(nextPlan.results).forEach((key) => {
    if (key.startsWith(`${gameId}:`)) {
      delete nextPlan.results[key];
    }
  });

  Object.keys(nextPlan.matchResults).forEach((key) => {
    if (key.startsWith(`${gameId}:`)) {
      delete nextPlan.matchResults[key];
    }
  });

  return nextPlan;
}

export function splitMembers(value) {
  return String(value ?? '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeState(state) {
  return JSON.stringify(state, null, 2);
}

export function deserializeState(rawState, createId = createStateId) {
  return normalizeState(JSON.parse(rawState), createId);
}

export function normalizeState(candidate, createId = createStateId) {
  return {
    teams: Array.isArray(candidate?.teams)
      ? candidate.teams.map((team) => ({
          id: String(team.id ?? createId()),
          name: String(team.name ?? ''),
          members: Array.isArray(team.members) ? team.members.map(String) : []
        }))
      : [],
    games: Array.isArray(candidate?.games)
      ? candidate.games.map((game) => ({
          id: String(game.id ?? createId()),
          name: String(game.name ?? ''),
          notes: String(game.notes ?? ''),
          playMode: normalizePlayMode(game.playMode)
        }))
      : [],
    plan: candidate?.plan ? normalizePlan(candidate.plan) : null
  };
}

function normalizePlan(plan) {
  return {
    ...plan,
    gameIds: Array.isArray(plan.gameIds) ? plan.gameIds.map(String) : [],
    teamIds: Array.isArray(plan.teamIds) ? plan.teamIds.map(String) : [],
    rankPoints: Array.isArray(plan.rankPoints) ? plan.rankPoints.map(Number).filter(Number.isFinite) : [],
    matchResults: plan.matchResults && typeof plan.matchResults === 'object' ? { ...plan.matchResults } : {},
    results: plan.results && typeof plan.results === 'object' ? { ...plan.results } : {},
    rounds: Array.isArray(plan.rounds) ? plan.rounds : []
  };
}

function clonePlan(plan) {
  return normalizePlan(structuredClone(plan));
}

function createStateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `state-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
