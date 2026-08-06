// frontend/app.scene.js
// Hooks scene generation and rendering into the existing UI

(async function(){
  const canvas = document.getElementById('scene-canvas');
  if(!canvas) return;
  const renderer = window.SceneRenderer;

  async function loadEnvMap(){
    try{ const r = await fetch('/api/env-map'); if(r.ok) return await r.json(); }catch(e){ console.warn('env-map fetch failed', e); }
    return { env: {} };
  }

  async function requestScene(zone){
    const player = { alignment: window.localStorage.getItem('pawaw_karma') || 'Neutre', main: { name: 'Player' } };
    const resp = await fetch('/api/generate-scene', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ zone, player }) });
    if(!resp.ok) throw new Error('scene generation failed');
    return await resp.json();
  }

  // basic control: buttons on portals already exist in DOM
  document.querySelectorAll('.portal').forEach(p => {
    p.addEventListener('click', async (e) => {
      const zoneName = (p.dataset.permalink || p.id || 'zone_utop_depart');
      try{
        const scene = await requestScene(zoneName);
        await renderer.renderScene(canvas, scene);
        window.currentScene = scene;
      }catch(err){ console.error('failed to load scene', err); }
    });
  });

  // initial load from URL
  const params = new URLSearchParams(location.search);
  const zone = params.get('zone') || 'zone_utop_depart';
  try{ const scene = await requestScene(zone); await renderer.renderScene(canvas, scene); window.currentScene = scene; }catch(e){ console.warn('initial scene fail', e); }

})();
