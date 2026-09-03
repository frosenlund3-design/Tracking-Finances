/**
 * Hele forsiden. Ingen framework, ingen byggeproces. Filen kører som den er.
 *
 * Tre dele: en lille markdown-visning, tale (ind og ud), og selve chatten.
 */

const $ = (id) => document.getElementById(id)

const gate = $('gate')
const app = $('app')
const thread = $('thread')
const welcome = $('welcome')
const input = $('input')
const sendButton = $('send')
const micButton = $('mic')
const speakToggle = $('speakToggle')
const listening = $('listening')

let state = { stripe: false, ghl: false, writes: false, sending: false, lastInputWasVoice: false }

/* ----------------------------------------------------------- markdown */

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Fed, kursiv, kode og links, anvendt på tekst der allerede er escapet. */
function inline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
}

const cells = (line) =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => inline(escapeHtml(cell.trim())))

/**
 * En bevidst lille markdown-visning: overskrifter, lister, tabeller, kode.
 * Alt escapes først, så der aldrig kan komme fremmed HTML ind på siden.
 */
function renderMarkdown(markdown) {
  const lines = markdown.split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      const code = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      i += 1
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    // Tabel: en linje med rør, og en streg-linje lige under.
    if (line.includes('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '')) {
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|')) rows.push(cells(lines[i++]))
      out.push(
        `<div class="table-scroll"><table><thead><tr>${head
          .map((c) => `<th>${c}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      )
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      out.push(`<h3>${inline(escapeHtml(heading[2]))}</h3>`)
      i += 1
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(inline(escapeHtml(lines[i++].replace(/^\s*[-*]\s+/, ''))))
      }
      out.push(`<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(inline(escapeHtml(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))))
      }
      out.push(`<ol>${items.map((t) => `<li>${t}</li>`).join('')}</ol>`)
      continue
    }

    if (!line.trim()) {
      i += 1
      continue
    }

    const paragraph = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^#{1,4}\s/.test(lines[i])
    ) {
      paragraph.push(inline(escapeHtml(lines[i++])))
    }
    out.push(`<p>${paragraph.join('<br>')}</p>`)
  }

  return out.join('')
}

/** Markdown → ren tekst, til oplæsning. */
const speakable = (markdown) =>
  markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`|_>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/* ---------------------------------------------------------------- tale */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
let recognition = null
let recognizing = false

function stopListening() {
  recognizing = false
  micButton.setAttribute('aria-pressed', 'false')
  listening.hidden = true
  try {
    recognition?.stop()
  } catch {
    /* stoppet allerede */
  }
}

function startListening() {
  if (!Recognition) {
    alert('Din browser understøtter ikke tale-til-tekst. Prøv Safari på iPhone eller Chrome.')
    return
  }
  if (recognizing) {
    stopListening()
    return
  }

  window.speechSynthesis?.cancel()

  recognition = new Recognition()
  recognition.lang = 'da-DK'
  recognition.interimResults = true
  recognition.continuous = false

  recognition.onresult = (event) => {
    let text = ''
    let final = false
    for (const result of event.results) {
      text += result[0].transcript
      if (result.isFinal) final = true
    }
    input.value = text.trim()
    autosize()
    if (final && input.value) {
      state.lastInputWasVoice = true
      stopListening()
      submit()
    }
  }

  recognition.onerror = () => stopListening()
  recognition.onend = () => {
    if (recognizing) stopListening()
  }

  recognizing = true
  micButton.setAttribute('aria-pressed', 'true')
  listening.hidden = false
  try {
    recognition.start()
  } catch {
    stopListening()
  }
}

let danishVoice = null
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() || []
  danishVoice = voices.find((v) => v.lang?.toLowerCase().startsWith('da')) || null
}
if (window.speechSynthesis) {
  pickVoice()
  window.speechSynthesis.onvoiceschanged = pickVoice
}

function speak(text, { thenListen = false } = {}) {
  if (!window.speechSynthesis || !text) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 1200))
  utterance.lang = 'da-DK'
  if (danishVoice) utterance.voice = danishVoice
  utterance.onend = () => {
    if (thenListen) startListening()
  }
  window.speechSynthesis.speak(utterance)
}

const speakOn = () => speakToggle.getAttribute('aria-pressed') === 'true'

/* ------------------------------------------------------------- beskeder */

function nearBottom() {
  return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120
}

function scrollDown(force = false) {
  if (force || nearBottom()) thread.scrollTop = thread.scrollHeight
}

function addMessage(role, text) {
  welcome?.remove()
  const wrapper = document.createElement('div')
  wrapper.className = `msg ${role}`
  const body = document.createElement('div')
  body.className = 'body'
  if (role === 'user') body.textContent = text
  else body.innerHTML = renderMarkdown(text)
  wrapper.append(body)
  thread.append(wrapper)
  scrollDown(true)
  return body
}

function addStatus(label, isWrite) {
  const row = document.createElement('div')
  row.className = `status${isWrite ? ' write' : ''}`
  const spinner = document.createElement('span')
  spinner.className = 'spinner'
  const text = document.createElement('span')
  text.textContent = `${label} …`
  row.append(spinner, text)
  thread.append(row)
  scrollDown()
  return { row, text }
}

/**
 * Kortet der spørger, før noget bliver skrevet i GoHighLevel.
 *
 * Det viser præcis hvad der vil blive skrevet og på hvem. Uden et ja herfra
 * bliver ingen skrivning udført, og det gælder også hvis modellen selv synes
 * den skal, fordi der stod noget i en note.
 */
function addConfirm(writes) {
  const card = document.createElement('div')
  card.className = 'confirm'

  const heading = document.createElement('p')
  heading.className = 'confirm-title'
  heading.textContent =
    writes.length > 1
      ? `Skal jeg skrive de her ${writes.length} ting i GoHighLevel?`
      : 'Skal jeg skrive det her i GoHighLevel?'
  card.append(heading)

  for (const write of writes) {
    const what = document.createElement('p')
    what.className = 'confirm-what'
    what.textContent = write.titel
    card.append(what)

    const list = document.createElement('dl')
    for (const [key, value] of write.felter) {
      const term = document.createElement('dt')
      term.textContent = key
      const detail = document.createElement('dd')
      detail.textContent = value
      list.append(term, detail)
    }
    card.append(list)
  }

  const buttons = document.createElement('div')
  buttons.className = 'confirm-buttons'
  const yes = document.createElement('button')
  yes.type = 'button'
  yes.className = 'primary'
  yes.textContent = 'Ja, skriv det'
  const no = document.createElement('button')
  no.type = 'button'
  no.className = 'chip'
  no.textContent = 'Nej, lad være'

  const answer = (approve) => {
    yes.disabled = true
    no.disabled = true
    const chosen = document.createElement('p')
    chosen.className = 'confirm-chosen'
    chosen.textContent = approve ? 'Du sagde ja.' : 'Du sagde nej. Der blev ikke skrevet noget.'
    buttons.replaceWith(chosen)
    converse('/api/confirm', { approve })
  }

  yes.addEventListener('click', () => answer(true))
  no.addEventListener('click', () => answer(false))
  buttons.append(yes, no)
  card.append(buttons)

  thread.append(card)
  scrollDown(true)
}

/* ----------------------------------------------------------------- chat */

function submit() {
  const text = input.value.trim()
  if (!text || state.sending) return

  input.value = ''
  autosize()
  addMessage('user', text)
  converse('/api/chat', { message: text })
}

/**
 * Ét svar fra serveren, læst mens det bliver skrevet. Bruges både til et nyt
 * spørgsmål og til at fortsætte efter et ja eller nej.
 */
async function converse(url, payload) {
  if (state.sending) return
  state.sending = true
  sendButton.disabled = true

  const statuses = new Map()
  let answer = ''
  let body = null
  let pending = false
  let failed = false
  let waiting = false // svaret er standset og venter på et ja eller nej

  const paint = () => {
    pending = false
    if (!body) body = addMessage('bot', '')
    body.innerHTML = renderMarkdown(answer)
    scrollDown()
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (response.status === 401) {
      showGate()
      return
    }
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}))
      failed = true
      addMessage('bot', `⚠️ ${data.error || 'Serveren svarede ikke.'}`)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue

        let event
        try {
          event = JSON.parse(line.slice(6))
        } catch {
          continue
        }

        if (event.type === 'text') {
          answer += event.text
          if (!pending) {
            pending = true
            requestAnimationFrame(paint)
          }
        } else if (event.type === 'thinking' && !body && statuses.size === 0) {
          statuses.set('__thinking', addStatus('Tænker', false))
        } else if (event.type === 'tool_start') {
          statuses.get('__thinking')?.row.remove()
          statuses.delete('__thinking')
          statuses.set(event.id, addStatus(event.label, event.writes))
        } else if (event.type === 'tool_end') {
          const status = statuses.get(event.id)
          if (status) {
            status.row.classList.add('done')
            status.text.textContent = status.text.textContent.replace(/ …$/, '')
          }
        } else if (event.type === 'confirm') {
          statuses.get('__thinking')?.row.remove()
          statuses.delete('__thinking')
          if (answer) paint()
          waiting = true
          addConfirm(event.writes)
        } else if (event.type === 'error') {
          failed = true
          addMessage('bot', `⚠️ ${event.message}`)
        }
      }
    }

    statuses.get('__thinking')?.row.remove()
    if (answer) paint()
    else if (!failed && !waiting) {
      addMessage('bot', 'Jeg fik ikke noget svar tilbage. Prøv at spørge igen.')
    }

    // Under en bekræftelse læses intet højt: brugeren skal se kortet, ikke
    // høre halvdelen af et svar mens hun beslutter sig.
    if (answer && !waiting && speakOn()) {
      speak(speakable(answer), { thenListen: state.lastInputWasVoice })
    }
  } catch {
    failed = true
    addMessage('bot', '⚠️ Forbindelsen blev afbrudt. Prøv igen.')
  } finally {
    if (!waiting) {
      state.lastInputWasVoice = false
      input.focus()
    }
    state.sending = false
    sendButton.disabled = false
  }
}

/* ------------------------------------------------------------------- UI */

function autosize() {
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`
}

function suggestions() {
  const list = []
  if (state.stripe) {
    list.push('Hvem mangler at betale?', 'Hvordan ser omsætningen ud denne måned?')
  }
  if (state.ghl) list.push('Giv mig alt om en kunde')
  if (state.stripe && state.ghl) list.push('Er der kunder uden kontrakt der betaler?')
  if (!list.length) list.push('Hvad kan du hjælpe med?')

  const box = $('suggestions')
  if (!box) return
  box.replaceChildren()
  for (const suggestion of list.slice(0, 4)) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'chip'
    chip.textContent = suggestion
    chip.addEventListener('click', () => {
      input.value = suggestion
      autosize()
      submit()
    })
    box.append(chip)
  }
}

function showGate() {
  gate.hidden = false
  app.hidden = true
  $('password').focus()
}

function showApp() {
  gate.hidden = true
  app.hidden = false
  input.focus()

  const dot = $('statusDot')
  const both = state.stripe && state.ghl
  dot.className = `dot ${both ? 'on' : state.stripe || state.ghl ? 'partial' : ''}`
  dot.title = `Stripe: ${state.stripe ? 'tilsluttet' : 'ikke sat op'} · GoHighLevel: ${
    state.ghl ? 'tilsluttet' : 'ikke sat op'
  }`

  const sources = []
  if (state.stripe) sources.push('Stripe')
  if (state.ghl) sources.push('GoHighLevel')
  $('welcomeSources').textContent = sources.length
    ? `Jeg kan se i ${sources.join(' og ')}. Spørg om en kunde, en betaling eller et overblik.`
    : 'Ingen systemer er koblet på endnu. Se opsætningen i README.'

  suggestions()
}

async function refresh() {
  try {
    const me = await (await fetch('/api/me')).json()
    state = { ...state, stripe: me.stripe, ghl: me.ghl, writes: me.writes }
    if (me.name) {
      $('brandName').textContent = me.name
      document.title = me.name
    }
    if (me.loggedIn) showApp()
    else showGate()
  } catch {
    showGate()
  }
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = $('loginButton')
  const error = $('loginError')
  button.disabled = true
  error.hidden = true

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('password').value }),
    })
    if (response.ok) {
      $('password').value = ''
      await refresh()
    } else {
      const data = await response.json().catch(() => ({}))
      error.textContent = data.error || 'Kunne ikke logge ind.'
      error.hidden = false
    }
  } catch {
    error.textContent = 'Ingen forbindelse til serveren.'
    error.hidden = false
  } finally {
    button.disabled = false
  }
})

$('composer').addEventListener('submit', (event) => {
  event.preventDefault()
  submit()
})

input.addEventListener('input', autosize)
input.addEventListener('keydown', (event) => {
  // Enter sender på computer; på telefon giver Enter en ny linje.
  const onPhone = window.matchMedia('(pointer: coarse)').matches
  if (event.key === 'Enter' && !event.shiftKey && !onPhone) {
    event.preventDefault()
    submit()
  }
})

micButton.addEventListener('click', startListening)

speakToggle.addEventListener('click', () => {
  const on = speakToggle.getAttribute('aria-pressed') === 'true'
  speakToggle.setAttribute('aria-pressed', String(!on))
  speakToggle.firstElementChild.textContent = on ? '🔈' : '🔊'
  if (on) window.speechSynthesis?.cancel()
})

$('newChat').addEventListener('click', async () => {
  window.speechSynthesis?.cancel()
  await fetch('/api/reset', { method: 'POST' })
  location.reload()
})

$('logout').addEventListener('click', async () => {
  window.speechSynthesis?.cancel()
  await fetch('/api/logout', { method: 'POST' })
  location.reload()
})

// Lille hjælp til at lægge den på hjemmeskærmen på iPhone.
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
if (isIos && !window.navigator.standalone) $('installHint').hidden = false

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}

refresh()
