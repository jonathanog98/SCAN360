
// === Helpers ===
function normalizePlate(input){
  return String(input||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase();
}
function showError(msg){
  console.error(msg);
  const box = document.createElement('div');
  box.style.background='#fee2e2';box.style.border='1px solid #fecaca';box.style.padding='10px';box.style.borderRadius='8px';box.style.margin='10px 0';
  box.textContent = '⚠️ ' + msg;
  document.body.prepend(box);
}

// === Supabase client ===
let supabaseClient = null;
function initSupabase(){
  if(!supabaseClient){
    const URL = (window && window.SUPABASE_URL) || null;
    const KEY = (window && window.SUPABASE_ANON_KEY) || null;
    if (!URL || !KEY){
      showError('No se encontró env.js o variables (window.SUPABASE_URL / window.SUPABASE_ANON_KEY).');
      throw new Error('Faltan variables de entorno');
    }
    supabaseClient = supabase.createClient(URL, KEY);
    window.__sb = supabaseClient;
  }
  return supabaseClient;
}

// === Catalog ===
async function loadChecklist(){
  const { data, error } = await supabaseClient.from('inspection_catalog')
    .select('*').order('grp',{ascending:true,nullsFirst:true}).order('position',{ascending:true});
  if (error){ showError('Error leyendo inspection_catalog: '+error.message); throw error; }
  return (data||[]).map(r=>({ key:r.point_key, label:r.point_label, grp:r.grp||null, position:r.position??0 }));
}

async function ensurePoints(caseId){
  const { data: pts, error: e0 } = await supabaseClient.from('inspection_points')
    .select('id').eq('case_id', caseId).limit(1);
  if (e0){ showError('Error validando puntos: '+e0.message); return; }
  if (pts && pts.length > 0) return;
  const catalog = await loadChecklist();
  if (!catalog.length){
    showError('Tu catálogo de inspección está vacío.'); return;
  }
  const rows = catalog.map(i=>({ case_id: caseId, point_key: i.key, point_label: i.label }));
  const { error: eIns } = await supabaseClient.from('inspection_points').insert(rows);
  if (eIns){ showError('No se pudieron sembrar puntos: '+eIns.message); }
}

// === Case helpers ===
async function getOrCreateCase(plate){
  plate = normalizePlate(plate);
  let { data: existing, error: e1 } = await supabaseClient.from('inspection_case')
    .select('*').eq('plate',plate).eq('status','open').maybeSingle();
  if (e1){ showError('Error buscando caso: '+e1.message); throw e1; }
  if (existing){
    await ensurePoints(existing.id); return existing;
  }
  const now = new Date().toISOString();
  const { data: created, error: e2 } = await supabaseClient.from('inspection_case')
    .insert({ plate, status:'open', salida_at: now }).select('*').single();
  if (e2){ showError('Error creando caso: '+e2.message); throw e2; }
  await ensurePoints(created.id);
  return created;
}

async function findCaseByPlate(plate){
  plate = normalizePlate(plate);
  const { data, error } = await supabaseClient.from('inspection_case')
    .select('*').eq('plate',plate).order('created_at',{ascending:false}).limit(1);
  if (error){ showError('Error buscando por placa: '+error.message); throw error; }
  const c = data?.[0]||null;
  if (c) await ensurePoints(c.id);
  return c;
}

async function getClosedCasesByPlate(plate){
  plate = normalizePlate(plate);
  const { data, error } = await supabaseClient.from('inspection_case')
    .select('*').eq('plate',plate).eq('status','closed').order('created_at',{ascending:false});
  if (error){ showError('Error leyendo cerradas: '+error.message); throw error; }
  return data||[];
}

async function getPoints(caseId){
  await ensurePoints(caseId);
  const { data, error } = await supabaseClient.from('inspection_points')
    .select('*').eq('case_id', caseId);
  if (error){ showError('Error leyendo puntos: '+error.message); throw error; }
  return data||[];
}

async function getCaseBundleById(caseId){
  await ensurePoints(caseId);
  const [{ data: cases }, { data: points }, { data: fotosSalida }, { data: fotosEntrada }] = await Promise.all([
    supabaseClient.from('inspection_case').select('*').eq('id', caseId).limit(1),
    supabaseClient.from('inspection_points').select('*').eq('case_id', caseId),
    supabaseClient.from('inspection_photos').select('*').eq('case_id', caseId).eq('phase','salida').order('created_at',{ascending:false}),
    supabaseClient.from('inspection_photos').select('*').eq('case_id', caseId).eq('phase','entrada').order('created_at',{ascending:false})
  ]);
  return { case: cases?.[0]||null, points: points||[], fotosSalida: fotosSalida||[], fotosEntrada: fotosEntrada||[] };
}

// === UI builders ===
function radio(name,value,checked){ return `<label><input type="radio" name="${name}" value="${value}" ${checked?'checked':''}> ${value}</label>`; }
function buildSalidaForm(points){
  if (!points?.length) return `<p><em>No hay puntos todavía.</em></p>`;
  points=[...points].sort((a,b)=>a.point_label.localeCompare(b.point_label));
  return points.map(p=>{ const name=`salida__${p.point_key}`; return `<div class="row"><div class="label">${p.point_label}</div><div class="controls">${radio(name,'Sí',false)}${radio(name,'No',false)}${radio(name,'No Aplica',false)}</div></div>`; }).join('');
}
function buildEntradaForm(points){
  if (!points?.length) return `<p><em>No hay puntos.</em></p>`;
  points=[...points].sort((a,b)=>a.point_label.localeCompare(b.point_label));
  return points.map(p=>{ const name=`entrada__${p.point_key}`; return `<div class="row two-col"><div class="left"><div class="label">${p.point_label}</div><div class="prev"><strong>Salida:</strong> ${p.salida_value||'-'}</div></div><div class="right">${radio(name,'Sí',false)}${radio(name,'No',false)}${radio(name,'No Aplica',false)}</div></div>`; }).join('');
}
function buildClosedTable(points){
  if (!points?.length) return '<p>No hay puntos.</p>';
  points=[...points].sort((a,b)=>a.point_label.localeCompare(b.point_label));
  const rows=points.map(p=>`<tr><td>${p.point_label}</td><td>${p.salida_value||'-'}</td><td>${p.entrada_value||'-'}</td></tr>`).join('');
  return `<table class="table"><thead><tr><th>Punto</th><th>Salida</th><th>Entrada</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// === Save helpers ===
async function saveSalida(caseId, byName){
  const inputs=[...document.querySelectorAll('input[type=radio]:checked')];
  const updates=[];
  const by=byName||document.getElementById('salida_by')?.value||'';
  for (const inp of inputs) if (inp.name.startsWith('salida__')) updates.push({ point_key: inp.name.replace('salida__',''), salida_value: inp.value });
  for (const u of updates){
    const { error } = await supabaseClient.from('inspection_points')
      .update({ salida_value:u.salida_value }).eq('case_id',caseId).eq('point_key',u.point_key);
    if (error){ showError('No se pudo actualizar un punto: '+error.message); throw error; }
  }
  const now=new Date().toISOString();
  const { error:errCase } = await supabaseClient.from('inspection_case')
    .update({ salida_at:now, salida_by: by||null }).eq('id',caseId);
  if (errCase){ showError('No se pudo actualizar el caso: '+errCase.message); throw errCase; }
  alert('Inspección de salida guardada.');
}
async function saveEntrada(caseId, byName, autoClose=true){
  const inputs=[...document.querySelectorAll('input[type=radio]:checked')];
  const updates=[];
  const by=byName||document.getElementById('entrada_by')?.value||'';
  for (const inp of inputs) if (inp.name.startsWith('entrada__')) updates.push({ point_key: inp.name.replace('entrada__',''), entrada_value: inp.value });
  for (const u of updates){
    const { error } = await supabaseClient.from('inspection_points')
      .update({ entrada_value:u.entrada_value }).eq('case_id',caseId).eq('point_key',u.point_key);
    if (error){ showError('No se pudo actualizar un punto: '+error.message); throw error; }
  }
  const now=new Date().toISOString();
  const { error:errCase } = await supabaseClient.from('inspection_case')
    .update({ entrada_at:now, entrada_by: by||null }).eq('id',caseId);
  if (errCase){ showError('No se pudo actualizar el caso: '+errCase.message); throw errCase; }
  if (autoClose){
    const { error:errClose } = await supabaseClient.from('inspection_case')
      .update({ status:'closed' }).eq('id',caseId);
    if (errClose){ showError('No se pudo cerrar el caso: '+errClose.message); throw errClose; }
    alert('Entrada guardada y caso cerrado.');
  } else {
    alert('Inspección de entrada guardada.');
  }
}

// === Photos ===
async function uploadPhoto(caseId, phase, file){
  const bucket = (window && window.STORAGE_BUCKET) || null;
  if (!bucket){ showError('Falta window.STORAGE_BUCKET en env.js'); throw new Error('No bucket'); }
  const name=`${caseId}/${phase}/${Date.now()}_${file.name}`;
  const { error } = await supabaseClient.storage.from(bucket).upload(name, file, { upsert:false });
  if (error){ showError('No se pudo subir una foto: '+error.message); throw error; }
  const { data:pub } = supabaseClient.storage.from(bucket).getPublicUrl(name);
  const url=pub.publicUrl;
  const ins = await supabaseClient.from('inspection_photos')
    .insert({ case_id:caseId, phase, url, uploaded_by:null });
  if (ins.error){ showError('No se pudo registrar una foto: '+ins.error.message); throw ins.error; }
  return url;
}
async function listPhotos(caseId, phase){
  const { data, error } = await supabaseClient.from('inspection_photos')
    .select('*').eq('case_id',caseId).eq('phase',phase).order('created_at',{ascending:false});
  if (error){ showError('No se pudieron listar fotos: '+error.message); throw error; }
  return data||[];
}
function renderPhotos(containerId, items){
  const el=document.getElementById(containerId);
  el.innerHTML=(items||[]).map(i=>`<a href="${i.url}" target="_blank"><img src="${i.url}" alt="foto"/></a>`).join('');
}

// === Input Sanitization on Frontend ===
document.addEventListener("DOMContentLoaded", () => {
  const plateInput = document.getElementById("plateInput");
  if (plateInput) {
    plateInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    });
  }
});

// Exports
window.normalizePlate=normalizePlate;
window.initSupabase=initSupabase;
window.getOrCreateCase=getOrCreateCase;
window.findCaseByPlate=findCaseByPlate;
window.getClosedCasesByPlate=getClosedCasesByPlate;
window.getPoints=getPoints;
window.getCaseBundleById=getCaseBundleById;
window.buildSalidaForm=buildSalidaForm;
window.buildEntradaForm=buildEntradaForm;
window.buildClosedTable=buildClosedTable;
window.saveSalida=saveSalida;
window.saveEntrada=saveEntrada;
window.uploadPhoto=uploadPhoto;
window.listPhotos=listPhotos;
window.renderPhotos=renderPhotos;
