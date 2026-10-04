// Opens a page in headless Chrome, waits, prints console output and window.__debug, and saves a
// screenshot. Used by the checks in docs/upgrading.md.
//
//   node scripts/check-page.mjs <url> <out.png> [extra Chrome flags...]
//
// Environment:
//   CHROME  path to the Chrome or Chromium executable (default: a standard install location)
//   WAIT    milliseconds to wait after navigation (default 4000)
//   INJECT  script to run before the page's own scripts, e.g. to simulate missing WebGPU
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const [url, out, ...flags] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: node scripts/check-page.mjs <url> <out.png> [chrome flags...]')
  process.exit(2)
}

const candidates = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean)
const chromePath = candidates.find(p => existsSync(p))
if (!chromePath) {
  console.error('Chrome not found; set CHROME')
  process.exit(2)
}

const port = 9400 + Math.floor(Math.random() * 400)
const chrome = spawn(chromePath, [
  '--headless=new',
  '--window-size=1280,720',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'cdp-'))}`,
  ...flags,
  'about:blank'
], { stdio: 'ignore' })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    target = list.find(t => t.type === 'page')
  } catch {}
}
if (!target) {
  chrome.kill()
  console.error('Chrome did not start')
  process.exit(1)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => ws.addEventListener('open', resolve))
let id = 0
const pending = new Map()
ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    console.log(`[console.${msg.params.type}]`, msg.params.args.map(a => a.value ?? a.description).join(' '))
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    console.log('[exception]', msg.params.exceptionDetails.exception?.description)
  }
})
const send = (method, params = {}) =>
  new Promise(resolve => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(JSON.stringify({ id: i, method, params }))
  })

await send('Runtime.enable')
await send('Page.enable')
if (process.env.INJECT) {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: process.env.INJECT })
}
await send('Page.navigate', { url })
await sleep(Number(process.env.WAIT ?? 4000))
const state = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    guidance: document.getElementById('guidance')?.hidden === false
      ? document.getElementById('guidance-reason')?.textContent
      : null,
    guidanceDetails: [...document.querySelectorAll('#guidance-details li')].map(l => l.textContent),
    canvas: !!document.querySelector('canvas'),
    debug: window.__debug ?? null
  })`,
  returnByValue: true
})
console.log('[state]', state.result.result.value)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
ws.close()
chrome.kill()
process.exit(0)
