# Tilehive — V1 core

This is the working core of Tilehive: the live mosaic, the queue with
fastest-finger claiming, free-hand painting inside a personal block, the
naming vote, inactivity check-ins, and the hourly reset — all running on
one Cloudflare Durable Object (`src/mosaic.js`), served by one Worker
(`src/index.js`) that also hands out the frontend page.

## What's real vs. what's a placeholder right now

**Working for real:**
- Live mosaic view, updating instantly for every visitor
- Joining the queue and getting a block during the 5-minute sizing window
- Free-hand painting with a 32-color palette, inside your block only
- Fastest-finger claiming when a block frees up
- Inactivity check-in and release
- The naming vote
- The hourly reset and a simple archive (saved, not yet browsable on its own page)

**Placeholder for now, on purpose:**
- Sign-in is just a name prompt, not real Google/Discord OAuth
- "VIP" exists in the code (queue priority) but isn't connected to Stripe yet
- Admin settings are a plain constants object in `mosaic.js` (`DEFAULT_CONFIG`), not yet a visual console
- No watermarking, downloads, or archive browsing page yet

None of these need the code rebuilt later — they get wired in on top of what's here.

## Running it locally first (recommended before deploying)

1. Install Node.js if you don't have it (nodejs.org — the LTS version).
2. Open a terminal in this folder and run:
   ```
   npm install
   npm run dev
   ```
3. It'll print a local address (something like `http://localhost:8787`). Open
   it in two browser tabs to see the live mosaic sync between them.

## Deploying to Cloudflare

1. Run `npx wrangler login` — this opens a browser to connect your Cloudflare account.
2. Run `npm run deploy`.
3. Wrangler prints a live URL like `tilehive.<yoursubdomain>.workers.dev` — that's
   your app, live on the internet.

## Next steps, in order

1. Point your purchased domain at this Worker (Cloudflare custom domains, under
   your Worker's settings — I'll walk you through the exact screen once you're here).
2. Swap the name-prompt login for real Google sign-in, using the Client ID/Secret
   from the Google Cloud project.
3. Wire VIP status to Stripe.
4. Build the Stats and Admin Console pages as real UI on top of the data
   that's already being tracked.
