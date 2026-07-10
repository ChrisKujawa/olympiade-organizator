import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGameResults,
  calculateStandings,
  createMatchups,
  generateGamePlan,
  getMatchupParticipants,
  getRoundsMissingTeamPairs,
  matchResultKey,
  normalizeRankPoints,
  resultKey
} from '../public/scheduler.js';

test('generateGamePlan creates one round per game with every team in every round', () => {
  const teams = [
    { id: 'team-a', name: 'A' },
    { id: 'team-b', name: 'B' },
    { id: 'team-c', name: 'C' },
    { id: 'team-d', name: 'D' }
  ];
  const games = [
    { id: 'game-1', name: 'One' },
    { id: 'game-2', name: 'Two' },
    { id: 'game-3', name: 'Three' },
    { id: 'game-4', name: 'Four' },
    { id: 'game-5', name: 'Five' }
  ];

  const plan = generateGamePlan(teams, games, { rng: () => 0.99 });

  assert.equal(plan.rounds.length, games.length);
  assert.deepEqual(plan.rankPoints, [4, 3, 2, 1]);

  for (const round of plan.rounds) {
    assert.ok(games.some((game) => game.id === round.gameId));
    assert.deepEqual(new Set(round.teamIds), new Set(teams.map((team) => team.id)));
    assert.deepEqual(new Set(round.matchups.flatMap((matchup) => matchup.teamIds)), new Set(round.teamIds));
    assert.equal(round.matchups.length, 6);
  }
});

test('generateGamePlan returns null without teams or games', () => {
  assert.equal(generateGamePlan([], [{ id: 'game-1', name: 'One' }]), null);
  assert.equal(generateGamePlan([{ id: 'team-a', name: 'A' }], []), null);
});

test('generateGamePlan ignores unnamed teams and games', () => {
  const plan = generateGamePlan(
    [
      { id: 'team-a', name: 'A' },
      { id: 'team-empty', name: '   ' },
      { id: 'team-b', name: 'B' }
    ],
    [
      { id: 'game-empty', name: '' },
      { id: 'game-1', name: 'One' }
    ],
    { rng: () => 0.99 }
  );

  assert.deepEqual(new Set(plan.teamIds), new Set(['team-a', 'team-b']));
  assert.deepEqual(plan.gameIds, ['game-1']);
  assert.deepEqual(plan.rounds[0].matchups, [
    { id: 'match-1-1', teamIds: ['team-a', 'team-b'] }
  ]);
});

test('generateGamePlan covers every team-vs-team pair in every game', () => {
  const teams = [
    { id: 'team-a', name: 'A' },
    { id: 'team-b', name: 'B' },
    { id: 'team-c', name: 'C' },
    { id: 'team-d', name: 'D' },
    { id: 'team-e', name: 'E' }
  ];
  const games = [
    { id: 'game-1', name: 'One' },
    { id: 'game-2', name: 'Two' },
    { id: 'game-3', name: 'Three' },
    { id: 'game-4', name: 'Four' }
  ];

  const plan = generateGamePlan(teams, games, { rng: () => 0.99 });

  assert.deepEqual(getRoundsMissingTeamPairs(plan.teamIds, plan.rounds), []);
});

test('getRoundsMissingTeamPairs reports games with uncovered team pairs', () => {
  const teamIds = ['team-a', 'team-b', 'team-c', 'team-d'];
  const rounds = [
    {
      id: 'round-1',
      gameId: 'game-1',
      matchups: [
        { id: 'match-1', teamIds: ['team-a', 'team-b'] },
        { id: 'match-2', teamIds: ['team-c', 'team-d'] }
      ]
    },
    {
      id: 'round-2',
      gameId: 'game-2',
      matchups: createMatchups(teamIds, 1)
    }
  ];

  assert.deepEqual(getRoundsMissingTeamPairs(teamIds, rounds), [
    {
      roundId: 'round-1',
      gameId: 'game-1',
      missingPairs: [
        ['team-a', 'team-c'],
        ['team-a', 'team-d'],
        ['team-b', 'team-c'],
        ['team-b', 'team-d']
      ]
    }
  ]);
});

test('createMatchups creates all team pairs', () => {
  const teamIds = ['team-a', 'team-b', 'team-c', 'team-d'];

  assert.deepEqual(createMatchups(teamIds, 0), [
    { id: 'match-1-1', teamIds: ['team-a', 'team-b'] },
    { id: 'match-1-2', teamIds: ['team-a', 'team-c'] },
    { id: 'match-1-3', teamIds: ['team-a', 'team-d'] },
    { id: 'match-1-4', teamIds: ['team-b', 'team-c'] },
    { id: 'match-1-5', teamIds: ['team-b', 'team-d'] },
    { id: 'match-1-6', teamIds: ['team-c', 'team-d'] }
  ]);
});

test('createMatchups creates all team pairs for odd team counts', () => {
  const matchups = createMatchups(['team-a', 'team-b', 'team-c', 'team-d', 'team-e'], 0);

  assert.deepEqual(matchups, [
    { id: 'match-1-1', teamIds: ['team-a', 'team-b'] },
    { id: 'match-1-2', teamIds: ['team-a', 'team-c'] },
    { id: 'match-1-3', teamIds: ['team-a', 'team-d'] },
    { id: 'match-1-4', teamIds: ['team-a', 'team-e'] },
    { id: 'match-1-5', teamIds: ['team-b', 'team-c'] },
    { id: 'match-1-6', teamIds: ['team-b', 'team-d'] },
    { id: 'match-1-7', teamIds: ['team-b', 'team-e'] },
    { id: 'match-1-8', teamIds: ['team-c', 'team-d'] },
    { id: 'match-1-9', teamIds: ['team-c', 'team-e'] },
    { id: 'match-1-10', teamIds: ['team-d', 'team-e'] }
  ]);
});

test('createMatchups creates no self matches or duplicate pairs', () => {
  const teamIds = ['team-a', 'team-b', 'team-c', 'team-d', 'team-e', 'team-f'];
  const matchups = createMatchups(teamIds, 2);
  const pairKeys = matchups.map((matchup) => matchup.teamIds.slice().sort().join(':'));

  assert.equal(matchups.length, 15);
  assert.equal(new Set(pairKeys).size, 15);
  assert.equal(matchups.every((matchup) => matchup.teamIds.length === 2), true);
  assert.equal(matchups.some((matchup) => matchup.teamIds[0] === matchup.teamIds[1]), false);
  assert.equal(matchups[0].id, 'match-3-1');
});

test('getMatchupParticipants includes team names and player names for match display', () => {
  const teams = [
    { id: 'team-a', name: 'Alpha', members: ['Ada', 'Ari'] },
    { id: 'team-b', name: 'Bravo', members: ['Bea'] }
  ];
  const matchup = { id: 'match-1-1', teamIds: ['team-a', 'team-b'] };

  assert.deepEqual(getMatchupParticipants(teams, matchup), [
    { teamId: 'team-a', name: 'Alpha', members: ['Ada', 'Ari'] },
    { teamId: 'team-b', name: 'Bravo', members: ['Bea'] }
  ]);
});

test('getMatchupParticipants keeps removed teams visible without crashing', () => {
  const teams = [{ id: 'team-a', name: 'Alpha', members: ['Ada'] }];
  const matchup = { id: 'match-1-1', teamIds: ['team-a', 'team-removed'] };

  assert.deepEqual(getMatchupParticipants(teams, matchup), [
    { teamId: 'team-a', name: 'Alpha', members: ['Ada'] },
    { teamId: 'team-removed', name: 'Removed team', members: [] }
  ]);
});

test('getMatchupParticipants treats missing member lists as empty', () => {
  const teams = [{ id: 'team-a', name: 'Alpha' }];
  const matchup = { id: 'match-1-1', teamIds: ['team-a'] };

  assert.deepEqual(getMatchupParticipants(teams, matchup), [
    { teamId: 'team-a', name: 'Alpha', members: [] }
  ]);
});

test('calculateStandings sums ranking points and sorts descending', () => {
  const teams = [
    { id: 'team-a', name: 'A' },
    { id: 'team-b', name: 'B' },
    { id: 'team-c', name: 'C' }
  ];
  const plan = {
    teamIds: teams.map((team) => team.id),
    gameIds: ['game-1', 'game-2'],
    rankPoints: [5, 3, 1],
    results: {
      [resultKey('game-1', 'team-a')]: { rank: '2' },
      [resultKey('game-2', 'team-a')]: { rank: '1' },
      [resultKey('game-1', 'team-b')]: { rank: '1' },
      [resultKey('game-2', 'team-b')]: { rank: '3' },
      [resultKey('game-1', 'team-c')]: { rank: '' },
      [resultKey('game-2', 'team-c')]: { rank: '2' }
    }
  };

  assert.deepEqual(calculateStandings(teams, plan), [
    { teamId: 'team-a', name: 'A', total: 8 },
    { teamId: 'team-b', name: 'B', total: 6 },
    { teamId: 'team-c', name: 'C', total: 3 }
  ]);
});

test('calculateGameResults totals matchup wins and assigns ranking points', () => {
  const teamIds = ['team-a', 'team-b', 'team-c'];
  const matchups = createMatchups(teamIds, 0);
  const plan = {
    teamIds,
    gameIds: ['game-1'],
    rankPoints: [5, 3, 1],
    matchResults: {
      [matchResultKey('game-1', matchups[0].id)]: { winnerTeamId: 'team-b' },
      [matchResultKey('game-1', matchups[1].id)]: { winnerTeamId: 'team-c' },
      [matchResultKey('game-1', matchups[2].id)]: { winnerTeamId: 'team-b' }
    },
    rounds: [
      {
        id: 'round-1',
        gameId: 'game-1',
        teamIds,
        matchups
      }
    ]
  };

  assert.deepEqual(calculateGameResults(plan, 'game-1'), [
    { teamId: 'team-b', wins: 2, losses: 0, hasResult: true, rank: 1, points: 5 },
    { teamId: 'team-c', wins: 1, losses: 1, hasResult: true, rank: 2, points: 3 },
    { teamId: 'team-a', wins: 0, losses: 2, hasResult: true, rank: 3, points: 1 }
  ]);
});

test('calculateGameResults ignores invalid winners and leaves the game unscored', () => {
  const teamIds = ['team-a', 'team-b'];
  const matchups = createMatchups(teamIds, 0);
  const plan = {
    teamIds,
    gameIds: ['game-1'],
    rankPoints: [2, 1],
    matchResults: {
      [matchResultKey('game-1', matchups[0].id)]: { winnerTeamId: 'team-missing' }
    },
    rounds: [
      {
        id: 'round-1',
        gameId: 'game-1',
        teamIds,
        matchups
      }
    ]
  };

  assert.deepEqual(calculateGameResults(plan, 'game-1'), [
    { teamId: 'team-a', wins: 0, losses: 0, hasResult: false, rank: 1, points: 0 },
    { teamId: 'team-b', wins: 0, losses: 0, hasResult: false, rank: 1, points: 0 }
  ]);
});

test('calculateGameResults ranks same wins with fewer losses higher', () => {
  const teamIds = ['team-a', 'team-b', 'team-c'];
  const matchups = createMatchups(teamIds, 0);
  const plan = {
    teamIds,
    gameIds: ['game-1'],
    rankPoints: [5, 3, 1],
    matchResults: {
      [matchResultKey('game-1', matchups[0].id)]: { winnerTeamId: 'team-a' },
      [matchResultKey('game-1', matchups[2].id)]: { winnerTeamId: 'team-b' }
    },
    rounds: [
      {
        id: 'round-1',
        gameId: 'game-1',
        teamIds,
        matchups
      }
    ]
  };

  assert.deepEqual(calculateGameResults(plan, 'game-1'), [
    { teamId: 'team-a', wins: 1, losses: 0, hasResult: true, rank: 1, points: 5 },
    { teamId: 'team-b', wins: 1, losses: 1, hasResult: true, rank: 2, points: 3 },
    { teamId: 'team-c', wins: 0, losses: 1, hasResult: true, rank: 3, points: 1 }
  ]);
});

test('calculateGameResults keeps equal win-loss records tied', () => {
  const teamIds = ['team-a', 'team-b', 'team-c'];
  const matchups = createMatchups(teamIds, 0);
  const plan = {
    teamIds,
    gameIds: ['game-1'],
    rankPoints: [5, 3, 1],
    matchResults: {
      [matchResultKey('game-1', matchups[0].id)]: { winnerTeamId: 'team-a' }
    },
    rounds: [
      {
        id: 'round-1',
        gameId: 'game-1',
        teamIds,
        matchups
      }
    ]
  };

  assert.deepEqual(calculateGameResults(plan, 'game-1'), [
    { teamId: 'team-a', wins: 1, losses: 0, hasResult: true, rank: 1, points: 5 },
    { teamId: 'team-c', wins: 0, losses: 0, hasResult: false, rank: 2, points: 0 },
    { teamId: 'team-b', wins: 0, losses: 1, hasResult: true, rank: 3, points: 1 }
  ]);
});

test('calculateStandings uses matchup-derived game ranking points', () => {
  const teams = [
    { id: 'team-a', name: 'A' },
    { id: 'team-b', name: 'B' }
  ];
  const matchups = createMatchups(teams.map((team) => team.id), 0);
  const plan = {
    teamIds: teams.map((team) => team.id),
    gameIds: ['game-1'],
    rankPoints: [2, 1],
    matchResults: {
      [matchResultKey('game-1', matchups[0].id)]: { winnerTeamId: 'team-b' }
    },
    rounds: [
      {
        id: 'round-1',
        gameId: 'game-1',
        teamIds: teams.map((team) => team.id),
        matchups
      }
    ]
  };

  assert.deepEqual(calculateStandings(teams, plan), [
    { teamId: 'team-b', name: 'B', total: 2 },
    { teamId: 'team-a', name: 'A', total: 1 }
  ]);
});

test('calculateStandings sums matchup-derived ranking points across games', () => {
  const teams = [
    { id: 'team-a', name: 'A' },
    { id: 'team-b', name: 'B' }
  ];
  const matchups = createMatchups(teams.map((team) => team.id), 0);
  const plan = {
    teamIds: teams.map((team) => team.id),
    gameIds: ['game-1', 'game-2'],
    rankPoints: [2, 1],
    matchResults: {
      [matchResultKey('game-1', matchups[0].id)]: { winnerTeamId: 'team-a' },
      [matchResultKey('game-2', matchups[0].id)]: { winnerTeamId: 'team-b' }
    },
    rounds: [
      {
        id: 'round-1',
        gameId: 'game-1',
        teamIds: teams.map((team) => team.id),
        matchups
      },
      {
        id: 'round-2',
        gameId: 'game-2',
        teamIds: teams.map((team) => team.id),
        matchups
      }
    ]
  };

  assert.deepEqual(calculateStandings(teams, plan), [
    { teamId: 'team-a', name: 'A', total: 3 },
    { teamId: 'team-b', name: 'B', total: 3 }
  ]);
});

test('result keys are stable and scoped to games and matches', () => {
  assert.equal(resultKey('game-1', 'team-a'), 'game-1:team-a');
  assert.equal(matchResultKey('game-1', 'match-1-1'), 'game-1:match-1-1');
});

test('normalizeRankPoints fills missing point values', () => {
  assert.deepEqual(normalizeRankPoints([10, '7'], 4), [10, 7, 2, 1]);
});

test('normalizeRankPoints truncates extra point values', () => {
  assert.deepEqual(normalizeRankPoints([10, 7, 5, 3], 2), [10, 7]);
});
