import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStandings,
  createMatchups,
  generateGamePlan,
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
    assert.equal(round.matchups.length, 2);
  }
});

test('createMatchups varies opponents across rounds', () => {
  const teamIds = ['team-a', 'team-b', 'team-c', 'team-d'];

  assert.deepEqual(createMatchups(teamIds, 0), [
    { id: 'match-1-1', teamIds: ['team-a', 'team-d'] },
    { id: 'match-1-2', teamIds: ['team-b', 'team-c'] }
  ]);
  assert.deepEqual(createMatchups(teamIds, 1), [
    { id: 'match-2-1', teamIds: ['team-a', 'team-c'] },
    { id: 'match-2-2', teamIds: ['team-d', 'team-b'] }
  ]);
});

test('createMatchups keeps odd team counts playing with one three-team matchup', () => {
  const matchups = createMatchups(['team-a', 'team-b', 'team-c', 'team-d', 'team-e'], 0);

  assert.deepEqual(matchups, [
    { id: 'match-1-1', teamIds: ['team-a', 'team-e'] },
    { id: 'match-1-2', teamIds: ['team-b', 'team-d', 'team-c'] }
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

test('normalizeRankPoints fills missing point values', () => {
  assert.deepEqual(normalizeRankPoints([10, '7'], 4), [10, 7, 2, 1]);
});
