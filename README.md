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

The included GitHub Actions workflow validates the app and deploys the static `public/` directory to GitHub Pages on pushes to `main`.

## Features

- Add teams with member lists.
- Add olympiade games with short notes.
- Generate a randomized one-game-at-a-time plan where every team plays every game.
- See generated matchups for who plays against whom in each game.
- Enter ranking results after each game with editable ranking points.
- See automatic standings.
- Export/import event data as JSON for backup or moving to another device.
- Install on a phone as an offline-capable PWA.

## Validate

```sh
npm run check
```
