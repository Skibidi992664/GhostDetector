// Minimal sensor-fusion prototype for mobile Safari
const startBtn = document.getElementById('startBtn')
const exportBtn = document.getElementById('exportBtn')
const clearBtn = document.getElementById('clearBtn')
const lockBtn = document.getElementById('lockBtn')
const passInput = document.getElementById('passphrase')
const statusEl = document.getElementById('status')
const scoreEl = document.getElementById('score')
const sensorsEl = document.getElementById('sensors')
const eventsList = document.getElementById('events')
const video = document.getElementById('video')
const vcanvas = document.getElementById('vcanvas')
const vctx = vcanvas.getContext('2d')

let audioCtx, analyser, dataArray
let running = false
let spectrogram = []
let savedEvents = []
let encrypted = false
let cryptoKey = null

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text
  }
}

function updateHUD(score, active) {
  scoreEl.textContent = Math.round(score)
  sensorsEl.textContent = active.join(', ') || 'none'
}

function addEvent(evt) {
  savedEvents.push(evt)
  const li = document.createElement('li')
  li.textContent = `${new Date(evt.timestamp).toLocaleTimeString()} — score ${Math.round(evt.score)} — ${evt.label}`
  eventsList.prepend(li)
  persistSavedEvents()
}

function persistSavedEvents() {
  const raw = JSON.stringify(savedEvents)
  if (cryptoKey) {
    encryptString(raw, passInput.value).then(b64 => {
      localStorage.setItem('sf_events_enc', b64)
    }).catch(()=>{ localStorage.setItem('sf_events', raw) })
  } else {
    localStorage.setItem('sf_events', raw)
    localStorage.removeItem('sf_events_enc')
  }
}

async function loadSavedEvents() {
  const enc = localStorage.getItem('sf_events_enc')
  const raw = localStorage.getItem('sf_events')
  if (enc && passInput.value) {
    try {
      const txt = await decryptString(enc, passInput.value)
      savedEvents = JSON.parse(txt)
    } catch (e) {
      console.warn('decrypt failed', e)
      savedEvents = raw ? JSON.parse(raw) : []
    }
  } else {
    savedEvents = raw ? JSON.parse(raw) : []
  }
  // populate UI
  eventsList.innerHTML = ''
  for (const evt of savedEvents.slice().reverse()) {
    const li = document.createElement('li')
    li.textContent = `${new Date(evt.timestamp).toLocaleTimeString()} — score ${Math.round(evt.score)} — ${evt.label}`
    eventsList.appendChild(li)
  }
}

async function start() {
  if (running) return stop()
  running = true
  startBtn.textContent = 'Stop Monitoring'

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('Browser does not support getUserMedia. Use Safari on iPhone over HTTPS.')
    running = false
    startBtn.textContent = 'Start Monitoring'
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'environment' } })
    video.srcObject = stream
    video.play().catch(() => {})
    setStatus('Camera + mic active. Waiting for sensor data...')

    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    dataArray = new Uint8Array(analyser.frequencyBinCount)
    source.connect(analyser)
  } catch (e) {
    console.warn('media error', e)
    setStatus('Permission denied or camera/mic unavailable. Reload and allow access.')
    running = false
    startBtn.textContent = 'Start Monitoring'
    return
  }

  window.addEventListener('devicemotion', onMotion)
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(()=>{}, ()=>{})
  }

  requestAnimationFrame(drawLoop)
}

function stop() {
  running = false
  startBtn.textContent = 'Start Monitoring'
  window.removeEventListener('devicemotion', onMotion)
  if (audioCtx) { audioCtx.close(); audioCtx = null }
}

let lastReadings = {}
let lastEventTime = 0

function onMotion(ev) {
  const acc = ev.accelerationIncludingGravity || ev.acceleration
  const gyro = ev.rotationRate
  lastReadings.acc = acc ? Math.hypot(acc.x||0, acc.y||0, acc.z||0) : 0
  lastReadings.gyro = gyro ? Math.hypot(gyro.alpha||0, gyro.beta||0, gyro.gamma||0) : 0
}

function computeBrightness() {
  try {
    vctx.drawImage(video, 0, 0, vcanvas.width, vcanvas.height)
    const img = vctx.getImageData(0,0,vcanvas.width,vcanvas.height)
    let sum = 0
    for (let i=0;i<img.data.length;i+=4) { sum += 0.2126*img.data[i]+0.7152*img.data[i+1]+0.0722*img.data[i+2] }
    return sum / (vcanvas.width*vcanvas.height)
  } catch(e) { return null }
}

function drawSpectrogramColumn(mags) {
  const canvas = document.getElementById('spec')
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  // shift left
  const img = ctx.getImageData(1,0,w-1,h)
  ctx.putImageData(img,0,0)
  // draw new column at right
  for (let i=0;i<mags.length;i++){
    const mag = mags[i]
    const y = h - Math.floor((i/mags.length)*h)
    const brightness = Math.min(255, Math.floor((mag/255)*255))
    ctx.fillStyle = `rgb(${brightness},0,${255-brightness})`
    ctx.fillRect(w-1,y,1,Math.ceil(h/mags.length))
  }
}

function drawLoop() {
  if (!running) return
  if (analyser) {
    analyser.getByteFrequencyData(dataArray)
    drawSpectrogramColumn(Array.from(dataArray.slice(0, dataArray.length/2)))
  }

  const brightness = computeBrightness()
  const audioLevel = analyser ? dataArray.reduce((a,b)=>a+b,0)/dataArray.length : 0

  setStatus(`Audio: ${Math.round(audioLevel)} | Brightness: ${brightness ? brightness.toFixed(0) : 'n/a'} | Motion: ${Math.round(lastReadings.acc||0)}`)

  const norm = {
    motion: Math.min(1, (lastReadings.acc||0)/5),
    gyro: Math.min(1, (lastReadings.gyro||0)/5),
    audio: Math.min(1, audioLevel/120),
    light: brightness? Math.min(1, brightness/200):0
  }

  // weighted fusion
  const weights = { motion:0.3, audio:0.3, light:0.2, gyro:0.2 }
  let score = 0
  let active = []
  for (let k of Object.keys(weights)){
    score += (norm[k]||0) * weights[k] * 100
    if ((norm[k]||0) > 0.25) active.push(k)
  }

  updateHUD(score, active)

  // event detection once per 2 seconds when threshold crossed
  if (score > 60 && Date.now() - lastEventTime > 2000) {
    lastEventTime = Date.now()
    const evt = { timestamp: Date.now(), score, label: score > 80 ? 'High' : 'Medium', sensors: active }
    addEvent(evt)
  }

  requestAnimationFrame(drawLoop)
}

exportBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(savedEvents,null,2)], {type:'application/json'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sensor_events_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
})

clearBtn.addEventListener('click', ()=>{
  if (!confirm('Clear saved events from this device?')) return
  savedEvents = []
  persistSavedEvents()
  eventsList.innerHTML = ''
})

lockBtn.addEventListener('click', async ()=>{
  if (!passInput.value) { alert('Enter a passphrase to lock/unlock'); return }
  // attempt to decrypt if encrypted present
  if (localStorage.getItem('sf_events_enc')) {
    try {
      const txt = await decryptString(localStorage.getItem('sf_events_enc'), passInput.value)
      savedEvents = JSON.parse(txt)
      cryptoKey = true
      encrypted = true
      loadSavedEvents()
      alert('Unlocked')
    } catch (e) {
      alert('Incorrect passphrase')
    }
  } else {
    // set key and persist
    cryptoKey = true
    encrypted = true
    persistSavedEvents()
    alert('Passphrase will be used to encrypt saved events')
  }
})

// load existing on startup
loadSavedEvents()

// Simple AES-GCM encryption helpers using passphrase
async function getKeyMaterial(password) {
  const enc = new TextEncoder()
  return await window.crypto.subtle.importKey('raw', enc.encode(password), {name:'PBKDF2'}, false, ['deriveKey'])
}

async function deriveKey(password, salt) {
  const keyMat = await getKeyMaterial(password)
  return await window.crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:100000, hash:'SHA-256'}, keyMat, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt'])
}

function bufToB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))) }
function b64ToBuf(b64) { return Uint8Array.from(atob(b64), c=>c.charCodeAt(0)) }

async function encryptString(plain, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const enc = new TextEncoder().encode(plain)
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc)
  // store salt|iv|ct as base64
  const payload = `${bufToB64(salt)}.${bufToB64(iv)}.${bufToB64(ct)}`
  return payload
}

async function decryptString(payload, password) {
  const parts = payload.split('.')
  if (parts.length !== 3) throw new Error('invalid')
  const salt = b64ToBuf(parts[0])
  const iv = b64ToBuf(parts[1])
  const ct = b64ToBuf(parts[2])
  const key = await deriveKey(password, salt)
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct)
  return new TextDecoder().decode(pt)
}

startBtn.addEventListener('click', start)

// Prompt to add to home screen hint
window.addEventListener('load', ()=>{
  if (navigator.standalone === false || !window.matchMedia('(display-mode: standalone)').matches) {
    // show short hint
    console.log('To install: Share → Add to Home Screen')
  }
})
