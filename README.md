# Hyperflow

The final productivity app. Acts as a super power wrapper around your Google Calendar that lets you plan tasks, mark expectations, track average time slip on tasks, improve your own time plan estimation abilities, and more rapidly schedule your work for today or following days to communicate and manage timings to other stakeholders.

## Stack

- [Vue 3](https://vuejs.org/) + `<script setup>` + TypeScript
- [Vite](https://vitejs.dev/) for dev/build tooling
- [Vue Router](https://router.vuejs.org/) and [Pinia](https://pinia.vuejs.org/) for routing/state
- No backend — the app talks to the user's Google Calendar directly from the browser via [Google Identity Services](https://developers.google.com/identity/gsi/web) (OAuth) and the [Calendar API v3](https://developers.google.com/calendar/api/v3/reference) REST endpoints

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

### Google OAuth setup

1. Create (or reuse) a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Calendar API** under APIs & Services.
3. Under APIs & Services > Credentials, create an **OAuth 2.0 Client ID** (Web application). Add `http://localhost:5173` (and your deployed URL) to **Authorized JavaScript origins**.
4. Copy the client ID into `.env` as `VITE_GOOGLE_CLIENT_ID`.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run preview` — preview the production build locally
- `npm run type-check` — run `vue-tsc` without emitting

## Deployment

The app builds to static assets (`dist/`) and needs no server, so it can be deployed to any static host — Vercel, Netlify, Cloudflare Pages, GitHub Pages, etc. A `vercel.json` with an SPA rewrite is included for Vercel deploys. Remember to set `VITE_GOOGLE_CLIENT_ID` (and add the deployed origin to the OAuth client's authorized origins) in the host's environment variables.
