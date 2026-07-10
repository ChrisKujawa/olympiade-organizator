export function generateGamePlan(teams, games, options = {}) {
  const rng = options.rng ?? Math.random;
  const activeTeams = shuffle(
    teams.filter((team) => team.name.trim().length > 0),
    rng
  );
  const activeGames = shuffle(
    games.filter((game) => game.name.trim().length > 0),
    rng
  );

  if (activeTeams.length === 0 || activeGames.length === 0) {
    return null;
  }

  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    gameIds: activeGames.map((game) => game.id),
    teamIds: activeTeams.map((team) => team.id),
    rankPoints: createDefaultRankPoints(activeTeams.length),
    results: {},
    rounds: activeGames.map((game, roundIndex) => ({
      id: `round-${roundIndex + 1}`,
      name: `Game ${roundIndex + 1}`,
      gameId: game.id,
      teamIds: shuffle(activeTeams, rng).map((team) => team.id)
    }))
  };
}

export function calculateStandings(teams, plan) {
  if (!plan) {
    return [];
  }

  const rankPoints = normalizeRankPoints(plan.rankPoints, plan.teamIds.length);

  return teams
    .filter((team) => plan.teamIds.includes(team.id))
    .map((team) => {
      const total = plan.gameIds.reduce((sum, gameId) => {
        const result = plan.results?.[resultKey(gameId, team.id)];
        const rank = Number(result?.rank);
        const points = Number.isInteger(rank) && rank > 0 ? rankPoints[rank - 1] ?? 0 : 0;
        return sum + points;
      }, 0);

      return {
        teamId: team.id,
        name: team.name,
        total
      };
    })
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
}

export function resultKey(gameId, teamId) {
  return `${gameId}:${teamId}`;
}

export function createDefaultRankPoints(teamCount) {
  return Array.from({ length: teamCount }, (_, index) => teamCount - index);
}

export function normalizeRankPoints(rankPoints, teamCount) {
  const normalized = Array.isArray(rankPoints)
    ? rankPoints.map(Number).filter((points) => Number.isFinite(points))
    : [];

  if (normalized.length >= teamCount) {
    return normalized.slice(0, teamCount);
  }

  return [
    ...normalized,
    ...createDefaultRankPoints(teamCount).slice(normalized.length)
  ];
}

function shuffle(items, rng) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
