// One-time interactive OAuth setup for Google Calendar ingestion.
// Run via: npm run auth:calendar
//
// Implements the installed-app / loopback OAuth flow (RFC 8252): a Desktop
// app OAuth client (as opposed to a Web application client) lets Google
// accept any http://127.0.0.1:<port> redirect URI without pre-registering
// a specific port, so we can just ask the OS for a free one.
//
// Writes the resulting refresh token to .google-calendar-token.json
// (gitignored). scripts/google-calendar-ingest.js reads it on every run.

import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const TOKEN_PATH = fileURLToPath(new URL('../.google-calendar-token.json', import.meta.url))

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`
    )
  }
  return value
}

const CLIENT_ID = requireEnv('GOOGLE_CALENDAR_CLIENT_ID')
const CLIENT_SECRET = requireEnv('GOOGLE_CALENDAR_CLIENT_SECRET')

async function exchangeCodeForTokens(code, redirectUri) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

async function main() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const redirectUri = `http://127.0.0.1:${port}`

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPE)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent') // forces a refresh_token even on re-auth

  console.log('\nOpen this URL and approve access with your Google account:\n')
  console.log(authUrl.toString())
  console.log('\nWaiting for you to approve in the browser...\n')

  exec(`open "${authUrl.toString()}"`, () => {}) // best-effort, macOS; ignore failures

  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      res.setHeader('Content-Type', 'text/html')
      res.end(
        error
          ? `<p>Authorization failed: ${error}. You can close this tab.</p>`
          : '<p>Authorized — you can close this tab and go back to the terminal.</p>'
      )

      server.close()
      if (error) reject(new Error(`Google denied authorization: ${error}`))
      else if (code) resolve(code)
      else reject(new Error('No code or error in callback — unexpected response.'))
    })
  })

  const tokens = await exchangeCodeForTokens(code, redirectUri)
  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh_token in the response. If you had already authorized this app before, ' +
        'revoke access at https://myaccount.google.com/permissions and run this again.'
    )
  }

  await writeFile(TOKEN_PATH, JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2) + '\n')
  console.log(`Saved refresh token to ${TOKEN_PATH}`)
  console.log('You can now run: npm run ingest:calendar')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
