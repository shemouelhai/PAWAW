/**
 * backend/index.js
 * Backend for PAWAW - story-mode-quest branch
 * Provides endpoints:
 *  - GET /api/env-map            => returns images/map_env.json
 *  - POST /api/generate-scene    => returns a scene JSON (uses Gemini if GEMINI_API_KEY provided)
 *  - PayPal endpoints for checkout (create-order, capture-order)
 *
 * Environment variables (.env):
 *  PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_MODE (sandbox|live), GEMINI_API_KEY, PORT
 */

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || '';
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const PAYPAL_BASE = PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

// map file path: repo root/images/map_env.json
const MAP_FILE = path.resolve(__dirname, '..', 'images', 'map_env.json');
const PURCHASES_FILE = path.resolve(__dirname, 'purchases.json');

// ensure purchases file exists
if(!fs.existsSync(PURCHASES_FILE)) fs.writeFileSync(PURCHASES_FILE, JSON.stringify({ purchases: [] }, null, 2));

function readMap(){
  if(fs.existsSync(MAP_FILE)) return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  return { env: {}, characters: {}, objects: {} };
}

// Simple PayPal access token helper (server-side REST v2)
let paypalToken = null;
let paypalTokenExpires = 0;
async function getPayPalAccessToken(){
  if(!PAYPAL_CLIENT || !PAYPAL_SECRET) throw new Error('PayPal credentials missing in env');
  if(paypalToken && Date.now() < paypalTokenExpires - 5000) return paypalToken;
  const creds = Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString('base64');
  const resp = await axios.post(`${PAYPAL_BASE}/v1/oauth2/token`, 'grant_type=client_credentials', {
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  paypalToken = resp.data.access_token;
  paypalTokenExpires = Date.now() + (resp.data.expires_in || 300) * 1000;
  return paypalToken;
}

// --- Endpoints ---
app.get('/api/env-map', (req, res) => {
  try{
    const map = readMap();
    res.json(map);
  }catch(err){ res.status(500).json({ error: 'map_read_failed', details: err.message }); }
});

// Helper: build fallback scene JSON (if Gemini not available)
function buildFallbackScene(zone, player){
  const map = readMap();
  const background = (map.env && map.env[zone]) || Object.values(map.env || {})[0] || 'images/Env/Utop.png';
  // simple seeded items for demo
  const items = [
    { id: 'rock_1', type: 'obstacle', sprite: 'images/objects/rock_small.png', x: 240, y: 320, w: 88, h: 48, collision: true },
    { id: 'bridge_1', type: 'bridge', sprite: 'images/objects/bridge_long.png', x: 420, y: 380, w: 220, h: 48, collision: true, interaction: { type: 'qte', windowMs: 900 } }
  ];
  const npcs = [
    { id: 'npc_merchant', role: 'merchant', disposition: player && player.alignment === 'Criminel' ? 'suspicious' : 'friendly', sprite: (map.characters && map.characters['pnj_mage']) || 'images/characters/Pnj mage .png', x: 120, y: 310, w: 64, h: 96 }
  ];
  return {
    zone,
    background,
    gridCell: (player && player.coords) || 'B3',
    narrative: `You step into ${zone}. The area hums with latent Pawaw energy.`,
    items, npcs,
    player: (player && player.main) ? Object.assign({}, player.main, { x: 200, y: 320, w:64, h:96 }) : { skin: (map.characters && map.characters['creation_humain']) || 'images/characters/Creation perso humain.png', x: 200, y: 320, w:64, h:96 },
    meta: { difficulty: 2 }
  };
}

// POST /api/generate-scene
app.post('/api/generate-scene', async (req, res) => {
  try{
    const { zone='zone_utop_depart', player = {} } = req.body || {};

    // If no Gemini key, return fallback
    if(!GEMINI_KEY) {
      return res.json(buildFallbackScene(zone, player));
    }

    // Build prompt for Gemini
    const prompt = `You are ViA, the Game-Master for PAWAW. Produce a strict JSON response describing a scene for zone: ${zone}.` +
      ` Input player state: ${JSON.stringify(player)}.` +
      ` Output JSON keys: zone, background (repo path), gridCell, narrative (1-3 sentences), items[], npcs[], player{}, meta{}. Use style 'retro-futuristic/cyber-organic'.`;

    // NOTE: Adapt this HTTP request to the exact Gemini SDK or REST API available to you.
    // Here we use a placeholder REST example (you should replace with official SDK usage if preferred).
    try{
      const gResp = await axios.post('https://api.example-gemini.fake/generate', { prompt }, { headers: { 'Authorization': `Bearer ${GEMINI_KEY}` }, timeout: 12000 });
      // Ideally parse gResp.data.text as JSON
      let sceneJson;
      try{ sceneJson = JSON.parse(gResp.data.output || gResp.data.text || '{}'); }catch(e){ sceneJson = null; }
      if(sceneJson) return res.json(sceneJson);
    }catch(err){
      console.warn('Gemini request failed, falling back to local stub', err.message || err);
      return res.json(buildFallbackScene(zone, player));
    }

  }catch(err){
    console.error('generate-scene error', err);
    res.status(500).json({ error: 'generate_failed', details: err.message });
  }
});

// --- PayPal create & capture (basic) ---
app.post('/api/create-order', async (req, res) => {
  try{
    const { comicId, pageIndex } = req.body || {};
    if(!comicId) return res.status(400).json({ error: 'comicId required' });
    const token = await getPayPalAccessToken();
    // For demo: price $0.99 if not provided
    const price = ((req.body && req.body.price) || 0.99).toFixed(2);
    const orderPayload = { intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: price } }] };
    const r = await axios.post(`${PAYPAL_BASE}/v2/checkout/orders`, orderPayload, { headers: { Authorization: `Bearer ${token}` } });
    const orderId = r.data.id;
    const purchases = JSON.parse(fs.readFileSync(PURCHASES_FILE, 'utf8'));
    purchases.purchases.push({ orderId, comicId, pageIndex, status: 'CREATED', createdAt: new Date().toISOString() });
    fs.writeFileSync(PURCHASES_FILE, JSON.stringify(purchases, null, 2));
    res.json({ orderId });
  }catch(err){ console.error('create-order err', err.response?.data || err.message || err); res.status(500).json({ error: 'create_order_failed' }); }
});

app.post('/api/capture-order', async (req, res) => {
  try{
    const { orderId, comicId, pageIndex } = req.body || {};
    if(!orderId) return res.status(400).json({ error: 'orderId required' });
    const token = await getPayPalAccessToken();
    const r = await axios.post(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {}, { headers: { Authorization: `Bearer ${token}` } });
    const purchases = JSON.parse(fs.readFileSync(PURCHASES_FILE, 'utf8'));
    const rec = purchases.purchases.find(p => p.orderId === orderId);
    if(rec){ rec.status = 'COMPLETED'; rec.capturedAt = new Date().toISOString(); rec.captureDetails = r.data; }
    else purchases.purchases.push({ orderId, comicId, pageIndex, status: 'COMPLETED', capturedAt: new Date().toISOString(), captureDetails: r.data });
    fs.writeFileSync(PURCHASES_FILE, JSON.stringify(purchases, null, 2));
    res.json({ status: 'COMPLETED', details: r.data });
  }catch(err){ console.error('capture err', err.response?.data || err.message || err); res.status(500).json({ error: 'capture_failed' }); }
});

// simple purchases list for a buyer (by buyerId header)
app.get('/api/purchases', (req, res) => {
  const buyerId = req.headers['x-buyer-id'] || req.query.buyerId || null;
  const purchases = JSON.parse(fs.readFileSync(PURCHASES_FILE, 'utf8')).purchases || [];
  if(buyerId) return res.json(purchases.filter(p => p.buyerId === buyerId));
  return res.json(purchases);
});

app.listen(PORT, () => console.log(`PAWAW backend (story-mode-quest) listening on ${PORT}`));
