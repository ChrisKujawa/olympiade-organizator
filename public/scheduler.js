export const PLAY_MODES = {
  ROUND_ROBIN: 'round-robin',
  KNOCKOUT: 'knockout'
};

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
    matchResults: {},
    results: {},
    rounds: activeGames.map((game, roundIndex) => ({
      id: `round-${roundIndex + 1}`,
      name: `Game ${roundIndex + 1}`,
      gameId: game.id,
      playMode: normalizePlayMode(game.playMode),
      teamIds: activeTeams.map((team) => team.id),
      matchups: createGameMatchups(activeTeams.map((team) => team.id), normalizePlayMode(game.playMode), roundIndex)
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
        const gameResults = calculateGameResults(plan, gameId);
        const gameResult = gameResults.find((result) => result.teamId === team.id);

        if (gameResults.some((result) => result.hasResult)) {
          return sum + (gameResult?.points ?? 0);
        }

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

export function calculateGameResults(plan, gameId) {
  const round = plan?.rounds?.find((candidate) => candidate.gameId === gameId);

  if (!round) {
    return [];
  }

  if (normalizePlayMode(round.playMode) === PLAY_MODES.KNOCKOUT) {
    return calculateKnockoutGameResults(plan, round);
  }

  const totals = new Map(
    round.teamIds.map((teamId) => [teamId, { teamId, wins: 0, losses: 0, hasResult: false }])
  );

  (round.matchups ?? []).forEach((matchup) => {
    const result = plan.matchResults?.[matchResultKey(gameId, matchup.id)];
    const winnerTeamId = result?.winnerTeamId;

    if (!matchup.teamIds.includes(winnerTeamId)) {
      return;
    }

    matchup.teamIds.forEach((teamId) => {
      const total = totals.get(teamId);
      total.hasResult = true;

      if (teamId === winnerTeamId) {
        total.wins += 1;
      } else {
        total.losses += 1;
      }
    });
  });

  const rankPoints = normalizeRankPoints(plan.rankPoints, round.teamIds.length);
  const rankedResults = [...totals.values()]
    .sort((left, right) => right.wins - left.wins || left.losses - right.losses || left.teamId.localeCompare(right.teamId));

  let previousRecord = null;
  let currentRank = 0;

  return rankedResults.map((result, index) => {
    const record = `${result.wins}:${result.losses}`;

    if (previousRecord !== record) {
      currentRank = index + 1;
      previousRecord = record;
    }

    return {
      ...result,
      rank: currentRank,
      points: result.hasResult ? rankPoints[currentRank - 1] ?? 0 : 0
    };
  });
}

export function resultKey(gameId, teamId) {
  return `${gameId}:${teamId}`;
}

export function matchResultKey(gameId, matchId) {
  return `${gameId}:${matchId}`;
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

export function normalizePlayMode(playMode) {
  return Object.values(PLAY_MODES).includes(playMode) ? playMode : PLAY_MODES.ROUND_ROBIN;
}

export function getRoundsMissingTeamPairs(teamIds, rounds) {
  const allPairs = createPairs(teamIds);

  return rounds
    .map((round) => {
      const playedPairs = new Set();

      if (normalizePlayMode(round.playMode) !== PLAY_MODES.ROUND_ROBIN) {
        return {
          roundId: round.id,
          gameId: round.gameId,
          missingPairs: []
        };
      }

      (round.matchups ?? []).forEach((matchup) => {
        createPairs(matchup.teamIds).forEach((pair) => playedPairs.add(pairKey(pair)));
      });

      return {
        roundId: round.id,
        gameId: round.gameId,
        missingPairs: allPairs.filter((pair) => !playedPairs.has(pairKey(pair)))
      };
    })
    .filter((round) => round.missingPairs.length > 0);
}

export function createGameMatchups(teamIds, playMode, roundIndex = 0) {
  return normalizePlayMode(playMode) === PLAY_MODES.KNOCKOUT
    ? createKnockoutMatchups(teamIds, roundIndex)
    : createMatchups(teamIds, roundIndex);
}

export function createMatchups(teamIds, roundIndex = 0) {
  return createPairs(teamIds).map((teamPair, pairIndex) => ({
    id: `match-${roundIndex + 1}-${pairIndex + 1}`,
    bracketRound: 1,
    teamIds: teamPair
  }));
}

export function createKnockoutMatchups(teamIds, roundIndex = 0) {
  if (teamIds.length === 0) {
    return [];
  }

  if (teamIds.length === 1) {
    return [{
      id: `match-${roundIndex + 1}-1`,
      bracketRound: 1,
      teamIds: [teamIds[0]]
    }];
  }

  const bracketSize = nextPowerOfTwo(teamIds.length);
  const seeds = [
    ...teamIds,
    ...Array.from({ length: bracketSize - teamIds.length }, () => null)
  ];
  const matchups = [];
  let currentMatchIds = [];

  for (let seedIndex = 0; seedIndex < bracketSize / 2; seedIndex += 1) {
    const teamPair = [seeds[seedIndex], seeds[bracketSize - seedIndex - 1]].filter(Boolean);
    const matchup = {
      id: `match-${roundIndex + 1}-${matchups.length + 1}`,
      bracketRound: 1,
      teamIds: teamPair
    };

    matchups.push(matchup);
    currentMatchIds.push(matchup.id);
  }

  let bracketRound = 2;

  while (currentMatchIds.length > 1) {
    const nextMatchIds = [];

    for (let matchIndex = 0; matchIndex < currentMatchIds.length; matchIndex += 2) {
      const matchup = {
        id: `match-${roundIndex + 1}-${matchups.length + 1}`,
        bracketRound,
        teamIds: [],
        sourceMatchIds: currentMatchIds.slice(matchIndex, matchIndex + 2)
      };

      matchups.push(matchup);
      nextMatchIds.push(matchup.id);
    }

    currentMatchIds = nextMatchIds;
    bracketRound += 1;
  }

  return matchups;
}

export function getMatchupParticipants(teams, matchup, round = null, matchResults = {}, gameId = '') {
  const teamIds = matchup.sourceMatchIds?.length
    ? matchup.sourceMatchIds
      .map((sourceMatchId) => getMatchupWinnerTeamId(round, sourceMatchId, matchResults, gameId))
      .filter(Boolean)
    : matchup.teamIds;

  return teamIds.map((teamId) => {
    const team = teams.find((candidate) => candidate.id === teamId);

    return {
      teamId,
      name: team?.name ?? 'Removed team',
      members: Array.isArray(team?.members) ? team.members : []
    };
  });
}

function calculateKnockoutGameResults(plan, round) {
  const totals = new Map(
    round.teamIds.map((teamId) => [teamId, {
      teamId,
      wins: 0,
      losses: 0,
      hasResult: false,
      eliminatedRound: null
    }])
  );

  const sortedMatchups = [...(round.matchups ?? [])].sort((left, right) => left.bracketRound - right.bracketRound);

  sortedMatchups.forEach((matchup) => {
    const participants = getMatchupParticipants([], matchup, round, plan.matchResults, round.gameId)
      .map((participant) => participant.teamId);
    const winnerTeamId = getMatchupWinnerTeamId(round, matchup.id, plan.matchResults, round.gameId);

    if (participants.length < 2 || !participants.includes(winnerTeamId)) {
      return;
    }

    participants.forEach((teamId) => {
      const total = totals.get(teamId);
      total.hasResult = true;

      if (teamId === winnerTeamId) {
        total.wins += 1;
      } else {
        total.losses += 1;
        total.eliminatedRound = matchup.bracketRound;
      }
    });
  });

  const rankPoints = normalizeRankPoints(plan.rankPoints, round.teamIds.length);
  const rankedResults = [...totals.values()]
    .sort((left, right) => {
      const leftProgress = left.eliminatedRound ?? Number.POSITIVE_INFINITY;
      const rightProgress = right.eliminatedRound ?? Number.POSITIVE_INFINITY;

      return rightProgress - leftProgress
        || right.wins - left.wins
        || left.losses - right.losses
        || left.teamId.localeCompare(right.teamId);
    });

  let previousRecord = null;
  let currentRank = 0;

  return rankedResults.map((result, index) => {
    const record = `${result.eliminatedRound ?? 'alive'}:${result.wins}:${result.losses}`;

    if (previousRecord !== record) {
      currentRank = index + 1;
      previousRecord = record;
    }

    return {
      teamId: result.teamId,
      wins: result.wins,
      losses: result.losses,
      hasResult: result.hasResult,
      rank: currentRank,
      points: result.hasResult ? rankPoints[currentRank - 1] ?? 0 : 0
    };
  });
}

function getMatchupWinnerTeamId(round, matchId, matchResults, gameId) {
  const matchup = round?.matchups?.find((candidate) => candidate.id === matchId);

  if (!matchup) {
    return null;
  }

  if (!matchup.sourceMatchIds?.length && matchup.teamIds.length === 1) {
    return matchup.teamIds[0];
  }

  const result = matchResults?.[matchResultKey(gameId, matchId)];
  return result?.winnerTeamId ?? null;
}

function createPairs(teamIds) {
  const pairs = [];

  for (let leftIndex = 0; leftIndex < teamIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < teamIds.length; rightIndex += 1) {
      pairs.push([teamIds[leftIndex], teamIds[rightIndex]]);
    }
  }

  return pairs;
}

function nextPowerOfTwo(value) {
  let power = 1;

  while (power < value) {
    power *= 2;
  }

  return power;
}

function pairKey(pair) {
  return [...pair].sort().join(':');
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
