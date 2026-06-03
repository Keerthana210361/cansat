import GspwidgetFuncsSelector from "https://esm.sh/@gspwidget/funcs-selector";
// ============================================
// CANSAT GCS - SIMULATION ENGINE
// ============================================

// --- STATE ---
let running = false;
let interval = null;
let packetCount = 0;
let missionSeconds = 0;
let timeInterval = null;
let telemetryLog = [];
let altitude = 500;

// --- GPS SIMULATION ---
let lat = 28.6139;
let lon = 77.2090;
let mapPath = [];

// ============================================
// STEP 5A: INITIALIZE MAP
// ============================================
const map = L.map('map').setView([lat, lon], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
const marker = L.marker([lat, lon]).addTo(map);
const pathLine = L.polyline([], { color: '#00ffcc', weight: 2 }).addTo(map);

// ============================================
// STEP 5B: INITIALIZE GRAPHS
// ============================================
function makeChart(id, label, color) {
  return new Chart(document.getElementById(id), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: label,
        data: [],
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.3
      }]
    },
    options: {
      animation: false,
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#445566', font: { size: 9 } },
             grid: { color: '#111' } },
        y: { ticks: { color: '#445566', font: { size: 9 } },
             grid: { color: '#111' } }
      }
    }
  });
}

const altChart  = makeChart('altChart',  'Altitude',    '#00ffcc');
const tempChart = makeChart('tempChart', 'Temperature', '#ffaa00');
const battChart = makeChart('battChart', 'Battery',     '#00aaff');

function updateChart(chart, value) {
  const time = new Date().toLocaleTimeString();
  chart.data.labels.push(time);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

// ============================================
// STEP 5C: ORIENTATION (Three.js cube)
// ============================================
const canvas3d = document.getElementById('orientCanvas');
const renderer = new THREE.WebGLRenderer({
  canvas: canvas3d, alpha: true, antialias: true
});
renderer.setSize(canvas3d.offsetWidth || 300, 180);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 300 / 180, 0.1, 1000);
camera.position.z = 3;

const geo      = new THREE.BoxGeometry(1.5, 0.4, 1);
const mat      = new THREE.MeshBasicMaterial({
  color: 0x00ffcc, wireframe: true
});
const satModel = new THREE.Mesh(geo, mat);
scene.add(satModel);

function animateOrient() {
  requestAnimationFrame(animateOrient);
  renderer.render(scene, camera);
}
animateOrient();

function updateOrientation(roll, pitch, yaw) {
  satModel.rotation.x = THREE.MathUtils.degToRad(pitch);
  satModel.rotation.y = THREE.MathUtils.degToRad(yaw);
  satModel.rotation.z = THREE.MathUtils.degToRad(roll);
}

// ============================================
// STEP 5D: TELEMETRY SIMULATION ENGINE
// ============================================
function generatePacket() {

  // Simulate descending altitude
  altitude = Math.max(0, altitude - (Math.random() * 5 + 3));

  const pressure     = 1013 - (altitude * 0.12) + (Math.random() - 0.5);
  const temperature  = 35 - (altitude * 0.006) + (Math.random() * 2 - 1);
  const descentRate  = 7 + Math.random() * 5;  // sometimes out of 8-10 range
  const battery      = 3.7 + Math.random() * 0.3;
  const rollVal      = Math.sin(packetCount * 0.1) * 30;
  const pitchVal     = Math.cos(packetCount * 0.08) * 20;
  const yawVal       = (packetCount * 3) % 360;
  const gpsLat       = lat + (Math.random() - 0.5) * 0.001;
  const gpsLon       = lon + (Math.random() - 0.5) * 0.001;

  // Error flags
  const e1 = (descentRate < 8 || descentRate > 10) ? 1 : 0;
  const e2 = 0;
  const e3 = altitude < 50 ? 0 : 0;   // payload sep at low alt
  const e4 = altitude < 20 ? 1 : 0;   // chute deploys near ground

  return {
    altitude: altitude.toFixed(1),
    pressure: pressure.toFixed(2),
    temperature: temperature.toFixed(1),
    descentRate: descentRate.toFixed(2),
    battery: battery.toFixed(2),
    roll: rollVal.toFixed(1),
    pitch: pitchVal.toFixed(1),
    yaw: yawVal.toFixed(1),
    lat: gpsLat.toFixed(6),
    lon: gpsLon.toFixed(6),
    e1, e2, e3, e4
  };
}

// ============================================
// STEP 5E: UPDATE UI WITH PACKET
// ============================================
function updateUI(p) {

  // Telemetry values
  document.getElementById('alt').textContent  = p.altitude;
  document.getElementById('pres').textContent = p.pressure;
  document.getElementById('temp').textContent = p.temperature;
  document.getElementById('desc').textContent = p.descentRate;
  document.getElementById('batt').textContent = p.battery;
  document.getElementById('roll').textContent = p.roll;
  document.getElementById('pitch').textContent = p.pitch;
  document.getElementById('yaw').textContent  = p.yaw;
  document.getElementById('lat').textContent  = p.lat;
  document.getElementById('lon').textContent  = p.lon;

  // Graphs
  updateChart(altChart,  parseFloat(p.altitude));
  updateChart(tempChart, parseFloat(p.temperature));
  updateChart(battChart, parseFloat(p.battery));

  // GPS Map
  const newLatLon = [parseFloat(p.lat), parseFloat(p.lon)];
  marker.setLatLng(newLatLon);
  mapPath.push(newLatLon);
  pathLine.setLatLngs(mapPath);

  // Orientation
  updateOrientation(
    parseFloat(p.roll),
    parseFloat(p.pitch),
    parseFloat(p.yaw)
  );

  // Error codes
  updateErrorCode('e1', p.e1,
    '✅ Descent Rate: Normal',
    '🚨 Descent Rate: OUT OF RANGE', 'e1-msg');
  updateErrorCode('e2', p.e2,
    '✅ GPS: Available',
    '🚨 GPS: UNAVAILABLE', 'e2-msg');
  updateErrorCode('e3', p.e3,
    '✅ Payload: Separated',
    '🚨 Payload: SEPARATION FAILED', 'e3-msg');
  updateErrorCode('e4', p.e4,
    '✅ Parachute: Inactive',
    '🚨 Parachute: EMERGENCY ACTIVATED', 'e4-msg');

  // Packet counter
  packetCount++;
  document.getElementById('packet-count').textContent =
    `Packets: ${packetCount}`;

  // Log data
  telemetryLog.push(p);
}

// ============================================
// STEP 5F: ERROR CODE UPDATER
// ============================================
function updateErrorCode(digitId, value, okMsg, faultMsg, msgId) {
  const digit = document.getElementById(digitId);
  const msg   = document.getElementById(msgId);

  digit.textContent = value;

  if (value === 1) {
    digit.classList.add('fault');
    msg.textContent = faultMsg;
    msg.className = 'fault-msg';
  } else {
    digit.classList.remove('fault');
    msg.textContent = okMsg;
    msg.className = '';
  }
}

// ============================================
// STEP 5G: CONTROL BUTTONS
// ============================================
function startTelemetry() {
  if (running) return;
  running = true;
  altitude = 500; // reset altitude

  interval = setInterval(() => {
    const packet = generatePacket();
    updateUI(packet);
  }, 1000);

  timeInterval = setInterval(() => {
    missionSeconds++;
    const h = String(Math.floor(missionSeconds / 3600)).padStart(2,'0');
    const m = String(Math.floor((missionSeconds % 3600) / 60)).padStart(2,'0');
    const s = String(missionSeconds % 60).padStart(2,'0');
    document.getElementById('mission-time').textContent =
      `T+ ${h}:${m}:${s}`;
  }, 1000);
}

function stopTelemetry() {
  running = false;
  clearInterval(interval);
  clearInterval(timeInterval);
}

function resetPackets() {
  stopTelemetry();
  packetCount = 0;
  missionSeconds = 0;
  telemetryLog = [];
  mapPath = [];
  pathLine.setLatLngs([]);
  altitude = 500;
  document.getElementById('packet-count').textContent = 'Packets: 0';
  document.getElementById('mission-time').textContent = 'T+ 00:00:00';
}

// ============================================
// STEP 5H: MISSION CONTROL COMMANDS
// ============================================
function manualSep() {
  document.getElementById('cmd-status').textContent =
    '⚡ CMD SENT: Manual Separation — EXECUTED';
  document.getElementById('cmd-status').style.color = '#00ff88';
}

function emergencyChute() {
  document.getElementById('cmd-status').textContent =
    '🚨 CMD SENT: Emergency Parachute — DEPLOYED';
  document.getElementById('cmd-status').style.color = '#ff4444';
}

function redundantActivation() {
  document.getElementById('cmd-status').textContent =
    '🔄 CMD SENT: Redundant Activation — CONFIRMED';
  document.getElementById('cmd-status').style.color = '#ffaa00';
}

// ============================================
// STEP 5I: CSV EXPORT
// ============================================
function exportCSV() {
  if (telemetryLog.length === 0) {
    alert('No telemetry data to export yet. Start telemetry first.');
    return;
  }

  const headers = [
    'Altitude','Pressure','Temperature',
    'DescentRate','Battery',
    'Roll','Pitch','Yaw',
    'Lat','Lon','E1','E2','E3','E4'
  ];

  const rows = telemetryLog.map(p => [
    p.altitude, p.pressure, p.temperature,
    p.descentRate, p.battery,
    p.roll, p.pitch, p.yaw,
    p.lat, p.lon, p.e1, p.e2, p.e3, p.e4
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'cansat_telemetry.csv';
  a.click();
}