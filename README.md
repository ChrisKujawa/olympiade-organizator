# Olympiade Organizator

A phone-friendly offline web app for organizing a personal olympiade with teams, members, games, rounds, and scores.

## Why this works offline

This app is a Progressive Web App (PWA). Open it once while online or from a local server, install it from the browser, and it keeps the application shell cached for offline use. Event data is stored locally in the browser with `localStorage`, so no internet connection or backend server is required after installation.

## Run locally

```sh
npm run dev
```

Then open <http://localhost:4173>.

## Deploy on GitHub Pages

The included GitHub Actions workflow validates the app on pull requests to `main` and deploys the static `public/` directory to GitHub Pages on pushes to `main`.

## Features

- Add teams with member lists.
- Add olympiade games with short notes and a play mode.
- Generate a randomized one-game-at-a-time plan where every team plays every game.
- Choose per-game play modes: everyone-vs-everyone or knockout.
- See generated matchups, including knockout bracket rounds and byes.
- Show the players for both teams directly in every matchup.
- Choose the winner for every matchup and let the app calculate game rankings.
- See automatic standings with editable ranking points.
- Add an overtime tie-breaker match without resetting existing results.
- See point progression over time and final statistics from saved match winners.
- Export/import event data as JSON for backup or moving to another device.
- Install on a phone as an offline-capable PWA.

## Dependency updates

Renovate is configured in `renovate.json`. Minor, patch, pin, digest, and lockfile-maintenance updates for npm and GitHub Actions are set to automerge after pull-request checks pass. Major updates stay manual.

## Validate

```sh
npm run check
```
