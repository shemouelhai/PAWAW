// frontend/sceneRenderer.js
// Responsible for rendering a scene JSON onto a canvas and drawing minimap markers

const SceneRenderer = (function(){
  const REPO_OWNER = 'shemouelhai';
  const REPO_NAME = 'PAWAW';
  const BRANCH = 'story-mode-quest';

  function repoRaw(pathInRepo){
    // ensure slashes are preserved
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${encodeURIComponent(pathInRepo).replace(/%2F/g, '/')}`;
  }

  function drawBackground(ctx, scene, canvas){
    return new Promise((resolve)=>{
      const bgPath = scene.background || (scene.zone && `images/Env/${scene.zone}.png`) || 'images/Env/Utop.png';
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = repoRaw(bgPath);
      img.onload = ()=>{
        // cover
        const r = Math.max(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * r, h = img.height * r;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img, (canvas.width - w)/2, (canvas.height - h)/2, w, h);
        resolve();
      };
      img.onerror = ()=> resolve();
    });
  }

  async function drawItems(ctx, scene){
    const items = (scene.items || []).slice().sort((a,b)=> (a.y||0) - (b.y||0));
    for(const it of items){
      try{
        const img = new Image(); img.crossOrigin='anonymous'; img.src = repoRaw(it.sprite);
        await new Promise(r=>{ img.onload=r; img.onerror=r; });
        ctx.drawImage(img, it.x || 0, it.y || 0, it.w || 64, it.h || 64);
      }catch(e){ console.warn('item draw failed', e); }
    }
  }

  async function drawNpcsAndPlayer(ctx, scene){
    const npcs = scene.npcs || [];
    for(const n of npcs){
      const img = new Image(); img.crossOrigin='anonymous'; img.src = repoRaw(n.sprite);
      await new Promise(r=>{ img.onload=r; img.onerror=r; });
      ctx.drawImage(img, n.x || 0, n.y || 0, n.w || 64, n.h || 96);
    }
    if(scene.player && scene.player.skin){
      const p = scene.player;
      const img = new Image(); img.crossOrigin='anonymous'; img.src = repoRaw(p.skin);
      await new Promise(r=>{ img.onload=r; img.onerror=r; });
      ctx.drawImage(img, p.x || 0, p.y || 0, p.w || 64, p.h || 96);
      // equipment overlays
      for(const eq of p.equipment || []){
        const eimg = new Image(); eimg.crossOrigin='anonymous'; eimg.src = repoRaw(eq.sprite);
        await new Promise(r=>{ eimg.onload=r; eimg.onerror=r; });
        ctx.drawImage(eimg, (p.x || 0) + (eq.offsetX||0), (p.y || 0) + (eq.offsetY||0), eq.w || 32, eq.h || 32);
      }
    }
  }

  function clearCanvas(ctx, canvas){ ctx.clearRect(0,0,canvas.width,canvas.height); }

  async function renderScene(canvas, scene){
    if(!canvas) throw new Error('canvas required');
    const ctx = canvas.getContext('2d');
    // scale canvas to device
    canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
    await drawBackground(ctx, scene, canvas);
    await drawItems(ctx, scene);
    await drawNpcsAndPlayer(ctx, scene);
  }

  function coordsToCell(x,y, canvasW, canvasH, cols=9, rows=5){
    const colIndex = Math.floor(clamp(x / canvasW * cols, 0, cols-1));
    const rowIndex = Math.floor(clamp(y / canvasH * rows, 0, rows-1));
    const col = String.fromCharCode(65 + colIndex);
    const row = 1 + rowIndex;
    return `${col}${row}`;
  }

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  return { renderScene, repoRaw, coordsToCell };
})();

// export for use in browser global context
window.SceneRenderer = SceneRenderer;
