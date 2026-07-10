import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGamePlan, matchResultKey, PLAY_MODES, resultKey } from '../public/scheduler.js';
import {
  addGame,
  addTeam,
  buildPlanWarning,
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
} from '../public/state.js';

test('splitMembers accepts commas and new lines', () => {
  assert.deepEqual(splitMembers('Ada, Bea\nCam\n\n Dee '), ['Ada', 'Bea', 'Cam', 'Dee']);
});

test('createTeam trims names and parses members', () => {
  const team = createTeam('  Red Rockets ', 'Ada\nBea', () => 'team-1');

  assert.deepEqual(team, {
    id: 'team-1',
    name: 'Red Rockets',
    members: ['Ada', 'Bea']
  });
});

test('createGame trims content and normalizes play mode', () => {
  const game = createGame('  Beer pong ', '  Best of one ', PLAY_MODES.KNOCKOUT, () => 'game-1');

  assert.deepEqual(game, {
    id: 'game-1',
    name: 'Beer pong',
    notes: 'Best of one',
    playMode: PLAY_MODES.KNOCKOUT
  });
});

test('add and update team state', () => {
  const state = addTeam(createEmptyState(), createTeam('Red', 'Ada', () => 'team-red'));
  const updatedState = updateTeam(state, 'team-red', { name: 'Blue', members: ['Bea'] });

  assert.deepEqual(updatedState.teams, [
    { id: 'team-red', name: 'Blue', members: ['Bea'] }
  ]);
  assert.deepEqual(state.teams, [
    { id: 'team-red', name: 'Red', members: ['Ada'] }
  ]);
});

test('add and update game state', () => {
  const state = addGame(createEmptyState(), createGame('Beer pong', '', undefined, () => 'game-1'));
  const updatedState = updateGame(state, 'game-1', {
    notes: 'Final cup wins',
    playMode: PLAY_MODES.KNOCKOUT
  });

  assert.deepEqual(updatedState.games, [
    {
      id: 'game-1',
      name: 'Beer pong',
      notes: 'Final cup wins',
      playMode: PLAY_MODES.KNOCKOUT
    }
  ]);
});

test('normalizeState supports imported legacy data and defaults missing fields', () => {
  const normalizedState = normalizeState({
    teams: [{ name: 'No ID', members: [1, 'Ada'] }],
    games: [{ id: 'game-1', name: 'Game', playMode: 'legacy-mode' }],
    plan: {
      gameIds: ['game-1'],
      teamIds: [1],
      rankPoints: ['5', 'bad'],
      rounds: [],
      matchResults: null,
      results: null
    }
  }, () => 'generated-id');

  assert.deepEqual(normalizedState, {
    teams: [{ id: 'generated-id', name: 'No ID', members: ['1', 'Ada'] }],
    games: [{ id: 'game-1', name: 'Game', notes: '', playMode: PLAY_MODES.ROUND_ROBIN }],
    plan: {
      gameIds: ['game-1'],
      teamIds: ['1'],
      rankPoints: [5],
      rounds: [],
      matchResults: {},
      results: {}
    }
  });
});

test('normalizeState normalizes malformed imported rounds and matchups', () => {
  const normalizedState = normalizeState({
    plan: {
      gameIds: [1],
      teamIds: [2],
      rounds: [
        {
          id: 3,
          gameId: 1,
          playMode: 'bad-mode',
          teamIds: [2, 4],
          matchups: [
            {
              id: 5,
              bracketRound: '2',
              teamIds: [2],
              sourceMatchIds: [8, 9]
            },
            {
              id: null,
              bracketRound: 'bad',
              teamIds: 'not-array'
            }
          ]
        }
      ]
    }
  });

  assert.deepEqual(normalizedState.plan.rounds, [
    {
      id: '3',
      gameId: '1',
      playMode: PLAY_MODES.ROUND_ROBIN,
      teamIds: ['2', '4'],
      matchups: [
        {
          id: '5',
          bracketRound: 2,
          teamIds: ['2'],
          sourceMatchIds: ['8', '9']
        },
        {
          id: '',
          bracketRound: 1,
          teamIds: []
        }
      ]
    }
  ]);
});

test('serializeState and deserializeState round trip import/export data', () => {
  const state = {
    teams: [{ id: 'team-a', name: 'A', members: ['Ada'] }],
    games: [{ id: 'game-1', name: 'Game', notes: 'Notes', playMode: PLAY_MODES.KNOCKOUT }],
    plan: null
  };

  assert.deepEqual(deserializeState(serializeState(state)), state);
});

test('removeTeam deletes team and cleans generated plan references/results', () => {
  const state = createPlannedState();
  const matchToRemove = state.plan.rounds[0].matchups.find((matchup) => matchup.teamIds.includes('team-b'));
  const matchToKeep = state.plan.rounds[0].matchups.find((matchup) =>
    matchup.teamIds.includes('team-a') && matchup.teamIds.includes('team-c')
  );
  const stateWithResults = {
    ...state,
    plan: {
      ...state.plan,
      results: {
        [resultKey('game-1', 'team-b')]: { rank: '1' },
        [resultKey('game-1', 'team-a')]: { rank: '2' }
      },
      matchResults: {
        [matchResultKey('game-1', matchToRemove.id)]: { winnerTeamId: 'team-a' },
        [matchResultKey('game-1', matchToKeep.id)]: { winnerTeamId: 'team-a' }
      }
    }
  };

  const nextState = removeTeam(stateWithResults, 'team-b');

  assert.equal(nextState.teams.some((team) => team.id === 'team-b'), false);
  assert.equal(nextState.plan.teamIds.includes('team-b'), false);
  assert.equal(nextState.plan.rounds.some((round) => round.teamIds.includes('team-b')), false);
  assert.equal(nextState.plan.rounds.some((round) => round.matchups.some((matchup) => matchup.teamIds.includes('team-b'))), false);
  assert.deepEqual(nextState.plan.results, {
    [resultKey('game-1', 'team-a')]: { rank: '2' }
  });
  assert.deepEqual(nextState.plan.matchResults, {
    [matchResultKey('game-1', matchToKeep.id)]: { winnerTeamId: 'team-a' }
  });
});

test('removeGame deletes game and cleans generated plan references/results', () => {
  const state = createPlannedState();
  const gameOneMatch = state.plan.rounds.find((round) => round.gameId === 'game-1').matchups[0];
  const gameTwoMatch = state.plan.rounds.find((round) => round.gameId === 'game-2').matchups[0];
  const stateWithResults = {
    ...state,
    plan: {
      ...state.plan,
      results: {
        [resultKey('game-1', 'team-a')]: { rank: '1' },
        [resultKey('game-2', 'team-a')]: { rank: '2' }
      },
      matchResults: {
        [matchResultKey('game-1', gameOneMatch.id)]: { winnerTeamId: 'team-a' },
        [matchResultKey('game-2', gameTwoMatch.id)]: { winnerTeamId: 'team-a' }
      }
    }
  };

  const nextState = removeGame(stateWithResults, 'game-1');

  assert.equal(nextState.games.some((game) => game.id === 'game-1'), false);
  assert.deepEqual(nextState.plan.gameIds, ['game-2']);
  assert.equal(nextState.plan.rounds.some((round) => round.gameId === 'game-1'), false);
  assert.deepEqual(nextState.plan.results, {
    [resultKey('game-2', 'team-a')]: { rank: '2' }
  });
  assert.deepEqual(nextState.plan.matchResults, {
    [matchResultKey('game-2', gameTwoMatch.id)]: { winnerTeamId: 'team-a' }
  });
});

test('buildPlanWarning reports no warning for current complete plans', () => {
  assert.equal(buildPlanWarning(createPlannedState()), '');
});

test('buildPlanWarning reports teams added after plan generation', () => {
  const state = {
    ...createPlannedState(),
    teams: [
      ...createPlannedState().teams,
      { id: 'team-new', name: 'New', members: [] }
    ]
  };

  assert.equal(buildPlanWarning(state), 'Some teams were added after this plan was generated. Regenerate rounds to include them.');
});

test('buildPlanWarning reports games added after plan generation', () => {
  const state = {
    ...createPlannedState(),
    games: [
      ...createPlannedState().games,
      { id: 'game-new', name: 'New', notes: '', playMode: PLAY_MODES.ROUND_ROBIN }
    ]
  };

  assert.equal(buildPlanWarning(state), 'Some games were added after this plan was generated. Regenerate rounds to include them.');
});

test('buildPlanWarning reports play mode changes after plan generation', () => {
  const state = createPlannedState();
  const changedState = updateGame(state, 'game-1', { playMode: PLAY_MODES.KNOCKOUT });

  assert.equal(buildPlanWarning(changedState), 'A game play mode changed after this plan was generated. Regenerate rounds to apply it.');
});

test('buildPlanWarning reports incomplete round-robin matchup coverage', () => {
  const state = createPlannedState();
  const brokenState = {
    ...state,
    plan: {
      ...state.plan,
      rounds: state.plan.rounds.map((round) => round.gameId === 'game-1'
        ? { ...round, matchups: round.matchups.slice(0, 1) }
        : round)
    }
  };

  assert.match(buildPlanWarning(brokenState), /Round robin does not include every team-vs-team matchup yet/);
});

function createPlannedState() {
  const teams = [
    { id: 'team-a', name: 'A', members: ['Ada'] },
    { id: 'team-b', name: 'B', members: ['Bea'] },
    { id: 'team-c', name: 'C', members: ['Cam'] }
  ];
  const games = [
    { id: 'game-1', name: 'Round robin', notes: '', playMode: PLAY_MODES.ROUND_ROBIN },
    { id: 'game-2', name: 'Knockout', notes: '', playMode: PLAY_MODES.KNOCKOUT }
  ];

  return {
    teams,
    games,
    plan: generateGamePlan(teams, games, { rng: () => 0.99 })
  };
}
