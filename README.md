# Lexa Backend

Fastify + TypeScript API for the Lexa vocabulary app.

## Local setup

```bash
cp .env.example .env
# fill in DATABASE_URL and ANTHROPIC_API_KEY

npm install
npm run migrate
npm run dev
```

Server starts on `http://localhost:3000` (or the port set in `.env`).

## Railway deployment

1. Push this repo to GitHub.
2. In Railway, click **New Project → Deploy from GitHub repo** and select this repo.
3. Add a **PostgreSQL** plugin — Railway will inject `DATABASE_URL` automatically.
4. Set the `ANTHROPIC_API_KEY` environment variable in the Railway service settings.
5. Railway runs `npm run build` then `npm run start` via `railway.toml` — no extra config needed.
6. Run migrations against the production DB:
   ```bash
   railway run npm run migrate
   ```
