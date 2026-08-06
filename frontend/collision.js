// frontend/collision.js
// Lightweight collision utilities

const Collision = (function(){
  function isColliding(a, b){
    if(!a || !b) return false;
    return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
  }

  function findCollision(playerRect, items){
    for(const it of items || []){
      if(it.collision){
        const box = { x: it.x, y: it.y, w: it.w, h: it.h };
        if(isColliding(playerRect, box)) return it;
      }
    }
    return null;
  }

  return { isColliding, findCollision };
})();

window.Collision = Collision;
