// backend/index.js
// PAWAW backend (story-mode-quest)
// Endpoints:
// - GET  /api/env-map
// - POST /api/generate-scene
// - POST /api/create-order
// - POST /api/capture-order
// - POST /api/generate-npc-dialog
//
// Environment variables (see .env.example)

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

const PORT = process.env.PORT || 3000;
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || '';
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const PAYPAL_BASE = PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

// Files
const MAP_FILE = path.resolve(__dirname, '..', 'images', 'map_env.json'); // optional repository map
const PURCHASES_FILE = path.resolve(__dirname, 'purchases.json');

// Ensure purchases file exists
if (!fs.existsSync(PURCHASES_FILE)) {
  fs.writeFileSync(PURCHASES_FILE, JSON.stringify({ purchases: [] }, null, 2));
}

// Helper: read map file if exists
function readMap() {
  try {
    if (fs.existsSync(MAP_FILE)) {
      const raw = fs.readFileSync(MAP_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('readMap error', e);
  }
  return { env: {}, characters: {}, objects: {} };
}

// PayPal access token helper
let paypalToken = null;
let paypalTokenExpires = 0;
async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT || !PAYPAL_SECRET) throw new Error('PayPal credentials missing in env');
  if (paypalToken && Date.now() < paypalTokenExpires - 5000) return paypalToken;
  const creds = Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString('base64');
  const resp = await axios.post(`${PAYPAL_BASE}/v1/oauth2/token`, 'grant_type=client_credentials', {
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000
  });
  paypalToken = resp.data.access_token;
  paypalTokenExpires = Date.now() + (resp.data.expires_in || 300) * 1000;
  return paypalToken;
}

// --- Routes ---

app.get('/api/env-map', (req, res) => {
  try {
    const map = readMap();
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: 'map_read_failed', details: err.message });
  }
});

// Fallback scene builder (used if Gemini not configured)
function buildFallbackScene(zone, player) {
  const map = readMap();
  const background = (map.env && map.env[zone]) || Object.values(map.env || {})[0] || '/assets/images/placeholder-bg.png';
  const items = [
    { id: 'rock_1', type: 'obstacle', sprite: '/assets/images/rock.png', x: 240, y: 320, w: 88, h: 48, collision: true },
    { id: 'bridge_1', type: 'bridge', sprite: '/assets/images/bridge.png', x: 420, y: 380, w: 220, h: 48, collision: true, interaction: { type: 'qte', windowMs: 900 } }
  ];
  const npcs = [
    { id: 'npc_merchant', role: 'merchant', disposition: player && player.alignment === 'Criminel' ? 'suspicious' : 'friendly', sprite: '/assets/images/pnj-mage.png', x: 120, y: 310, w: 64, h: 96 }
  ];
  return {
    zone,
    background,
    gridCell: (player && player.coords) || 'B3',
    narrative: `You step into ${zone}. The area hums with latent Pawaw energy.`,
    items, npcs,
    player: (player && player.main) ? Object.assign({}, player.main, { x: 200, y: 320, w: 64, h: 96 }) : { skin: '/assets/images/placeholder-player.png', x: 200, y: 320, w: 64, h: 96 },
    meta: { difficulty: 2 }
  };
}

app.post('/api/generate-scene', async (req, res) => {
  try {
    const { zone = 'zone_utop_depart', player = {} } = req.body || {};

    if (!GEMINI_KEY) {
      return res.json(buildFallbackScene(zone, player));
    }

    // Example prompt for server-side Gemini (replace with official SDK/endpoint)
    const prompt = `You are ViA, the Game-Master. Produce strict JSON for a scene for zone: ${zone}. Player: ${JSON.stringify(player)}. Output keys: zone, background, gridCell, narrative, items[], npcs[], player{}, meta{}. JSON ONLY.`;

    try {
      // NOTE: Replace the URL below with your provider endpoint / SDK call.
      const gResp = await axios.post('https://api.example-gemini.fake/generate', { prompt }, { headers: { Authorization: `Bearer ${GEMINI_KEY}` }, timeout: 12000 });
      let sceneJson;
      try { sceneJson = JSON.parse(gResp.data.output || gResp.data.text || '{}'); } catch (e) { sceneJson = null; }
      if (sceneJson) return res.json(sceneJson);
    } catch (err) {
      console.warn('Gemini request failed, returning fallback', err.message || err);
      return res.json(buildFallbackScene(zone, player));
    }

  } catch (err) {
    console.error('generate-scene error', err);
    res.status(500).json({ error: 'generate_failed', details: err.message });
  }
});

// PayPal: create order
app.post('/api/create-order', async (req, res) => {
  try {
    const { comicId, pageIndex } = req.body || {};
    if (!comicId) return res.status(400).json({ error: 'comicId required' });
    const token = await getPayPalAccessToken();
    const price = ((req.body && req.body.price) || 0.99).toFixed(2);
    const orderPayload = { intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: price } }] };
    const r = await axios.post(`${PAYPAL_BASE}/v2/checkout/orders`, orderPayload, { headers: { Authorization: `Bearer ${token}` } });
    const orderId = r.data.id;
    const purchases = JSON.parse(fs.readFileSync(PURCHASES_FILE, 'utf8'));
    purchases.purchases.push({ orderId, comicId, pageIndex, status: 'CREATED', createdAt: new Date().toISOString() });
    fs.writeFileSync(PURCHASES_FILE, JSON.stringify(purchases, null, 2));
    res.json({ orderId });
  } catch (err) {
    console.error('create-order err', err.response?.data || err.message || err);
    res.status(500).json({ error: 'create_order_failed' });
  }
});

// PayPal: capture order
app.post('/api/capture-order', async (req, res) => {
  try {
    const { orderId, comicId, pageIndex } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const token = await getPayPalAccessToken();
    const r = await axios.post(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {}, { headers: { Authorization: `Bearer ${token}` } });
    const purchases = JSON.parse(fs.readFileSync(PURCHASES_FILE, 'utf8'));
    const rec = purchases.purchases.find(p => p.orderId === orderId);
    if (rec) { rec.status = 'COMPLETED'; rec.capturedAt = new Date().toISOString(); rec.captureDetails = r.data; }
    else purchases.purchases.push({ orderId, comicId, pageIndex, status: 'COMPLETED', capturedAt: new Date().toISOString(), captureDetails: r.data });
    fs.writeFileSync(PURCHASES_FILE, JSON.stringify(purchases, null, 2));
    res.json({ status: 'COMPLETED', details: r.data });
  } catch (err) {
    console.error('capture err', err.response?.data || err.message || err);
    res.status(500).json({ error: 'capture_failed' });
  }
});

// simple purchases list
app.get('/api/purchases', (req, res) => {
  const purchases = JSON.parse(fs.readFileSync(PURCHASES_FILE, 'utf8')).purchases || [];
  res.json(purchases);
});

// NPC dialog generation (proxy to server-side LLM)
app.post('/api/generate-npc-dialog', async (req, res) => {
  try {
    const { npc = {}, player = {} } = req.body || {};
    if (!GEMINI_KEY) {
      return res.json({ text: npc.default || `Hello ${player.name || 'Player'}` });
    }
    // Example: call server-side LLM endpoint (replace with official SDK)
    const prompt = `NPC: ${JSON.stringify(npc)}\nPlayer: ${JSON.stringify(player)}\nGenerate a short dialog line in one or two sentences.`;
    try {
      const gResp = await axios.post('https://api.example-gemini.fake/generate', { prompt }, { headers: { Authorization: `Bearer ${GEMINI_KEY}` }, timeout: 10000 });
      const text = gResp.data.output || gResp.data.text || npc.default || '';
      return res.json({ text });
    } catch (e) {
      return res.json({ text: npc.default || '' });
    }
  } catch (err) { res.status(500).json({ error: 'npc_dialog_failed' }); }
});

// Health
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => console.log(`PAWAW backend listening on ${PORT}`));
