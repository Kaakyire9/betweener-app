# Betweener

Betweener is a React Native dating and social discovery app built with Expo and Supabase.

## Stack

- React Native 0.81
- Expo SDK 54
- Expo Router
- Supabase Auth, Postgres, Storage, Edge Functions
- TypeScript

## Core product areas

- Vibes discovery and recommendation flows
- Profile interest and profile insights
- Gifts, boosts, and premium subscription surfaces
- Chat, stickers, offline outbox, and push notifications
- Moments, comments, reactions, and replies
- Circles, gatherings, prompts, and moderation flows

## Local development

1. Install dependencies

```bash
npm install
```

2. Configure environment variables in `.env`

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Start Expo

```bash
npx expo start
```

## Useful scripts

```bash
npm run lint
npm run typecheck
npm run test:chat-logic
npm run test:vibes-logic
npm run supabase:types:check
```

## Database

- SQL migrations live in `supabase/migrations`.
- Edge Functions live in `supabase/functions`.
- Keep generated Supabase types in sync before merging schema changes.

## Quality gate

GitHub Actions now runs:

- lint
- typecheck
- chat logic tests
- vibes logic tests
- Supabase type drift check

## Current engineering reality

The app already has meaningful production depth: offline flows, notification routing, premium surfaces, and several custom recommendation systems. The main risk is maintainability, not lack of features. Large screens and components should be broken down further before the team or feature set expands much more.
