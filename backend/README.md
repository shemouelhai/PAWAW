# PAWAW backend (story-mode-quest)

This backend provides endpoints used by the PAWAW PWA for story generation, environment mapping and payments (PayPal sandbox/live).

Setup:
1. cd backend
2. npm install
3. create a .env file with:

PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_SECRET=your_paypal_secret
PAYPAL_MODE=sandbox
GEMINI_API_KEY=your_gemini_api_key (optional)
PORT=3000

4. npm start

API endpoints:
- GET /api/env-map -> returns images/map_env.json content
- POST /api/generate-scene -> { zone, player } returns scene JSON
- POST /api/create-order -> { comicId, pageIndex, price } -> { orderId }
- POST /api/capture-order -> { orderId, comicId, pageIndex } -> capture result
- GET /api/purchases

Notes:
- Do not commit your .env with keys.
- The Gemini call in generate-scene is a placeholder; replace with the official SDK / REST call per your account.
