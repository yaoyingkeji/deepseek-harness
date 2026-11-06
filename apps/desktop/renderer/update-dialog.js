/** Main-owned copy and responses; Escape is cancellation, never acceptance. */
const api = window.dshUpdateDialog
let view
let responding = false
function respond(index) {
  if (responding || view === undefined || view.busyButton !== undefined) return
  responding = true
  void api.respond(view.revision, index).catch(() => { responding = false })
}
document.getElementById('close').addEventListener('click', () => { respond(view.cancelId) })
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && view !== undefined) { event.preventDefault(); respond(view.cancelId) }
  if (event.key !== 'Tab') return
  const controls = [...document.querySelectorAll('button:not(:disabled), details:not([hidden]) > summary, details[open]:not([hidden]) > pre')]
  if (controls.length === 0) { event.preventDefault(); return }
  const current = controls.indexOf(document.activeElement)
  const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
    : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
  event.preventDefault()
  controls[next].focus()
})
// Renders detail text with http(s) URLs as clickable links that open in the
// default browser via IPC; built with DOM APIs (no innerHTML) to prevent injection.
// Newlines are preserved as text so textContent stays intact and CSS pre-wrap renders them.
const urlPattern = /https?:\/\/[^\s]+/g
function linkifyDetail(detail) {
  const container = document.getElementById('detail')
  container.replaceChildren()
  if (detail === '') return
  let lastIndex = 0
  for (const match of detail.matchAll(urlPattern)) {
    if (match.index > lastIndex) container.append(detail.slice(lastIndex, match.index))
    const link = document.createElement('a')
    link.textContent = match[0]
    link.href = match[0]
    link.addEventListener('click', (event) => {
      event.preventDefault()
      void api.openExternal(match[0])
    })
    container.append(link)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < detail.length) container.append(detail.slice(lastIndex))
}
function render(state) {
  if (state === null) {
    responding = true
    document.body.classList.remove('visible')
    return
  }
  if (view !== undefined && state.revision <= view.revision) return
  responding = false
  view = state
  document.documentElement.lang = state.locale
  document.title = state.title
  document.getElementById('title').textContent = state.message
  linkifyDetail(state.detail)
  document.getElementById('detail').hidden = state.detail === ''
  document.getElementById('close').disabled = state.busyButton !== undefined
  document.getElementById('close').setAttribute('aria-label', state.closeLabel)
  document.getElementById('technical-details').hidden = state.technicalDetails === ''
  document.getElementById('technical-details-label').textContent = state.technicalDetailsLabel
  document.getElementById('technical-details-content').textContent = state.technicalDetails
  document.getElementById('technical-details').open = false
  document.getElementById('actions').replaceChildren()
  for (const [index, label] of state.buttons.entries()) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.disabled = state.busyButton !== undefined
    if (state.busyButton === index) button.setAttribute('aria-busy', 'true')
    button.className = index === 0 ? 'primary' : 'secondary'
    button.addEventListener('click', () => { respond(index) })
    document.getElementById('actions').append(button)
  }
  document.querySelector('main').hidden = false
  document.getElementById('dialog').scrollTop = 0
  document.body.classList.add('visible')
  document.getElementById('dialog').focus()
}
let received = false
const unsubscribe = api.subscribe(state => { received = true; render(state) })
window.addEventListener('pagehide', unsubscribe, { once: true })
void api.status().then(state => { if (!received) render(state) })
