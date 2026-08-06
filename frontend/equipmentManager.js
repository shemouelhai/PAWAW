// frontend/equipmentManager.js
// Manage equipment storage in localStorage and provide helper for rendering layers

const EquipmentManager = (function(){
  const KEY = 'pawaw_equipment_v1';
  function load(){ return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  function save(obj){ localStorage.setItem(KEY, JSON.stringify(obj)); }
  function equip(slot, item){ const e = load(); e[slot] = item; save(e); return e; }
  function unequip(slot){ const e = load(); delete e[slot]; save(e); return e; }
  function get(slot){ const e = load(); return slot ? e[slot] : e; }

  return { load, save, equip, unequip, get };
})();

window.EquipmentManager = EquipmentManager;
