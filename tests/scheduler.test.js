import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGameResults,
  calculateStandings,
  createMatchups,
  generateGamePlan,
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

test('calculateGameResults totals matchup scores and assigns ranking points', () => {
  const teamIds = ['team-a', 'team-b', 'team-c'];
  const matchups = createMatchups(teamIds, 0);
  const plan = {
    teamIds,
    gameIds: ['game-1'],
    rankPoints: [5, 3, 1],
    matchResults: {
      [matchResultKey('game-1', matchups[0].id, 'team-a')]: { score: '10' },
      [matchResultKey('game-1', matchups[0].id, 'team-b')]: { score: '4' },
      [matchResultKey('game-1', matchups[1].id, 'team-a')]: { score: '1' },
      [matchResultKey('game-1', matchups[1].id, 'team-c')]: { score: '7' },
      [matchResultKey('game-1', matchups[2].id, 'team-b')]: { score: '9' },
      [matchResultKey('game-1', matchups[2].id, 'team-c')]: { score: '2' }
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
    { teamId: 'team-b', score: 13, hasScore: true, rank: 1, points: 5 },
    { teamId: 'team-a', score: 11, hasScore: true, rank: 2, points: 3 },
    { teamId: 'team-c', score: 9, hasScore: true, rank: 3, points: 1 }
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
      [matchResultKey('game-1', matchups[0].id, 'team-a')]: { score: '3' },
      [matchResultKey('game-1', matchups[0].id, 'team-b')]: { score: '5' }
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

test('normalizeRankPoints fills missing point values', () => {
  assert.deepEqual(normalizeRankPoints([10, '7'], 4), [10, 7, 2, 1]);
});
