/**
 * App Watch — เชื่อมต่อข้อมูลกับ Smart Watch ผ่าน Web Bluetooth API
 *
 * ใช้มาตรฐาน Bluetooth GATT services:
 *   - Heart Rate         (0x180D) → Heart Rate Measurement (0x2A37)
 *   - Battery            (0x180F) → Battery Level (0x2A19)
 *   - Device Information (0x180A) → Manufacturer/Model/Firmware
 *
 * หมายเหตุ: Web Bluetooth รองรับเฉพาะ Chrome/Edge และต้องเปิดผ่าน https หรือ localhost
 */

// --- GATT UUIDs (มาตรฐานของ Bluetooth SIG) ---
const SERVICES = {
  heartRate: 'heart_rate',
  battery: 'battery_service',
  deviceInfo: 'device_information',
};

const CHARS = {
  heartRateMeasurement: 'heart_rate_measurement', // 0x2A37
  batteryLevel: 'battery_level', // 0x2A19
  manufacturer: 'manufacturer_name_string', // 0x2A29
  modelNumber: 'model_number_string', // 0x2A24
  firmware: 'firmware_revision_string', // 0x2A26
};

// --- State ---
let device = null;
let server = null;
const dataLog = []; // { time, type, value }
const hrHistory = []; // เก็บค่าหัวใจสำหรับวาดกราฟ (สูงสุด 60 จุด)
const HR_HISTORY_MAX = 60;

// --- DOM ---
const $ = (id) => document.getElementById(id);
const els = {
  connectBtn: $('connectBtn'),
  disconnectBtn: $('disconnectBtn'),
  exportBtn: $('exportBtn'),
  statusDot: $('statusDot'),
  statusText: $('statusText'),
  deviceName: $('deviceName'),
  manufacturer: $('manufacturer'),
  modelNumber: $('modelNumber'),
  firmware: $('firmware'),
  heartRate: $('heartRate'),
  battery: $('battery'),
  batteryFill: $('batteryFill'),
  hrChart: $('hrChart'),
  log: $('log'),
  unsupported: $('unsupported'),
};

// --- ตรวจสอบการรองรับ ---
if (!navigator.bluetooth) {
  els.unsupported.hidden = false;
  els.connectBtn.disabled = true;
}

// --- ตัวช่วย ---
function setStatus(state, text) {
  els.statusDot.dataset.state = state;
  els.statusText.textContent = text;
}

function log(type, message, isEvent = false) {
  const time = new Date().toLocaleTimeString('th-TH');
  dataLog.push({ time, type, value: message });
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (isEvent ? ' event' : '');
  entry.innerHTML = `<span class="time">[${time}]</span> ${message}`;
  els.log.prepend(entry);
  els.exportBtn.disabled = dataLog.length === 0;
}

// --- เชื่อมต่อ ---
async function connect() {
  try {
    setStatus('connecting', 'กำลังค้นหาอุปกรณ์...');
    log('event', '🔍 เปิดหน้าต่างเลือกอุปกรณ์ Bluetooth', true);

    device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [SERVICES.heartRate] },
        { services: [SERVICES.battery] },
      ],
      optionalServices: [SERVICES.deviceInfo, SERVICES.battery, SERVICES.heartRate],
    });

    device.addEventListener('gattserverdisconnected', onDisconnected);
    els.deviceName.textContent = device.name || '(ไม่มีชื่อ)';

    setStatus('connecting', 'กำลังเชื่อมต่อ...');
    log('event', `🔗 กำลังเชื่อมต่อกับ "${device.name || device.id}"`, true);

    server = await device.gatt.connect();

    setStatus('connected', `เชื่อมต่อแล้ว: ${device.name || 'อุปกรณ์'}`);
    log('event', '✅ เชื่อมต่อสำเร็จ', true);

    els.connectBtn.disabled = true;
    els.disconnectBtn.disabled = false;

    // อ่านข้อมูลแต่ละ service (ไม่ขัดกันถ้าบาง service ไม่มี)
    await Promise.allSettled([
      readDeviceInfo(server),
      subscribeHeartRate(server),
      readBattery(server),
    ]);
  } catch (err) {
    if (err.name === 'NotFoundError') {
      setStatus('disconnected', 'ยกเลิกการเลือกอุปกรณ์');
      log('event', 'ℹ️ ผู้ใช้ยกเลิกการเลือกอุปกรณ์', true);
    } else {
      setStatus('disconnected', 'เชื่อมต่อล้มเหลว');
      log('event', `❌ ข้อผิดพลาด: ${err.message}`, true);
    }
    resetButtons();
  }
}

// --- Device Information Service ---
async function readDeviceInfo(server) {
  try {
    const service = await server.getPrimaryService(SERVICES.deviceInfo);
    const reads = [
      [CHARS.manufacturer, els.manufacturer],
      [CHARS.modelNumber, els.modelNumber],
      [CHARS.firmware, els.firmware],
    ];
    for (const [charUuid, el] of reads) {
      try {
        const ch = await service.getCharacteristic(charUuid);
        const val = await ch.readValue();
        const text = new TextDecoder().decode(val).trim();
        el.textContent = text || '—';
        log('device_info', `${charUuid}: ${text}`);
      } catch (_) {
        /* characteristic นี้อาจไม่มี — ข้ามไป */
      }
    }
  } catch (_) {
    log('event', 'ℹ️ อุปกรณ์ไม่มี Device Information Service', true);
  }
}

// --- Heart Rate Service (subscribe แบบ real-time) ---
async function subscribeHeartRate(server) {
  try {
    const service = await server.getPrimaryService(SERVICES.heartRate);
    const ch = await service.getCharacteristic(CHARS.heartRateMeasurement);
    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', onHeartRate);
    log('event', '❤️ เริ่มรับข้อมูลอัตราการเต้นหัวใจ', true);
  } catch (_) {
    log('event', 'ℹ️ อุปกรณ์ไม่มี Heart Rate Service', true);
  }
}

function onHeartRate(event) {
  const value = event.target.value;
  const flags = value.getUint8(0);
  // bit 0 = รูปแบบค่า: 0 = uint8, 1 = uint16
  const is16bit = flags & 0x01;
  const bpm = is16bit ? value.getUint16(1, true) : value.getUint8(1);

  els.heartRate.textContent = bpm;
  log('heart_rate', `❤️ ${bpm} bpm`);

  hrHistory.push(bpm);
  if (hrHistory.length > HR_HISTORY_MAX) hrHistory.shift();
  drawHeartRateChart();
}

// --- Battery Service ---
async function readBattery(server) {
  try {
    const service = await server.getPrimaryService(SERVICES.battery);
    const ch = await service.getCharacteristic(CHARS.batteryLevel);

    const update = (dataView) => {
      const level = dataView.getUint8(0);
      els.battery.textContent = level;
      els.batteryFill.style.width = `${level}%`;
      log('battery', `🔋 ${level}%`);
    };

    update(await ch.readValue());

    // นาฬิกาบางรุ่นรองรับ notify การเปลี่ยนแปลงแบต
    try {
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', (e) => update(e.target.value));
    } catch (_) {
      /* ไม่รองรับ notify — อ่านครั้งเดียวพอ */
    }
  } catch (_) {
    log('event', 'ℹ️ อุปกรณ์ไม่มี Battery Service', true);
  }
}

// --- วาดกราฟหัวใจแบบ sparkline ---
function drawHeartRateChart() {
  const canvas = els.hrChart;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.height;

  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr;
    ctx.scale(dpr, dpr);
  }
  ctx.clearRect(0, 0, w, h);

  if (hrHistory.length < 2) return;

  const min = Math.min(...hrHistory) - 5;
  const max = Math.max(...hrHistory) + 5;
  const range = Math.max(max - min, 1);
  const stepX = w / (HR_HISTORY_MAX - 1);

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ff5470';
  hrHistory.forEach((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// --- ตัดการเชื่อมต่อ ---
function disconnect() {
  if (device && device.gatt.connected) {
    device.gatt.disconnect();
  }
}

function onDisconnected() {
  setStatus('disconnected', 'ตัดการเชื่อมต่อแล้ว');
  log('event', '🔌 อุปกรณ์ถูกตัดการเชื่อมต่อ', true);
  resetButtons();
}

function resetButtons() {
  els.connectBtn.disabled = !navigator.bluetooth;
  els.disconnectBtn.disabled = true;
}

// --- ส่งออก CSV ---
function exportCsv() {
  const rows = [['time', 'type', 'value'], ...dataLog.map((r) => [r.time, r.type, r.value])];
  const csv = rows
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `app-watch-data-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Event listeners ---
els.connectBtn.addEventListener('click', connect);
els.disconnectBtn.addEventListener('click', disconnect);
els.exportBtn.addEventListener('click', exportCsv);
