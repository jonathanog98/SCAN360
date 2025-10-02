
// === Helpers ===
function normalizePlate(input){
  return String(input||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase();
}

// === Supabase client ===
let supabaseClient = null;
function initSupabase(){
  if(!supabaseClient){
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// === Catalog ===
async function loadChecklist(){
  const { data, error } = await supabaseClient.from('inspection_catalog')
    .select('*').order('grp',{ascending:true,nullsFirst:true}).order('position',{ascending:true});
  if (error) throw error;
  return (data||[]).map(r=>({ key:r.point_key, label:r.point_label, grp:r.grp||null, position:r.position??0 }));
}

// === Case helpers ===
async function getOrCreateCase(plate){
  plate = normalizePlate(plate);
  let { data: existing, error: e1 } = await supabaseClient.from('inspection_case')
    .select('*').eq('plate',plate).eq('status','open').maybeSingle();
  if (e1) throw e1;
  if (existing) return existing;

  const now = new Date().toISOString();
  const { data: created, error: e2 } = await supabaseClient.from('inspection_case')
    .insert({ plate, status:'open', salida_at: now }).select('*').single();
  if (e2) throw e2;

  const catalog = await loadChecklist();
  if (catalog.length){
    const rows = catalog.map(i=>({ case_id: created.id, point_key: i.key, point_label: i.label }));
    const { error: e3 } = await supabaseClient.from('inspection_points').insert(rows);
    if (e3) console.warn('Sembrar puntos: ', e3.message);
  }
  return created;
}

async function findCaseByPlate(plate){
  plate = normalizePlate(plate);
  const { data, error } = await supabaseClient.from('inspection_case')
    .select('*').eq('plate',plate).order('created_at',{ascending:false}).limit(1);
  if (error) throw error; return data?.[0]||null;
}

async function getClosedCasesByPlate(plate){
  plate = normalizePlate(plate);
  const { data, error } = await supabaseClient.from('inspection_case')
    .select('*').eq('plate',plate).eq('status','closed').order('created_at',{ascending:false});
  if (error) throw error; return data||[];
}

async function getPoints(caseId){
  const { data, error } = await supabaseClient.from('inspection_points')
    .select('*').eq('case_id', caseId);
  if (error) throw error; return data||[];
}

async function getCaseBundleById(caseId){
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
  if (!points?.length) return `<p><em>No hay puntos todavía para esta tablilla.</em></p>`;
  points=[...points].sort((a,b)=>a.point_label.localeCompare(b.point_label));
  return points.map(p=>{ const name=`salida__${p.point_key}`; return `<div class="row"><div class="label">${p.point_label}</div><div class="controls">${radio(name,'Sí',false)}${radio(name,'No',false)}${radio(name,'No Aplica',false)}</div></div>`; }).join('');
}
function buildEntradaForm(points){
  if (!points?.length) return `<p><em>No hay puntos para esta tablilla.</em></p>`;
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
    if (error) throw error;
  }
  const now=new Date().toISOString();
  const { error:errCase } = await supabaseClient.from('inspection_case')
    .update({ salida_at:now, salida_by: by||null }).eq('id',caseId);
  if (errCase) throw errCase;
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
    if (error) throw error;
  }
  const now=new Date().toISOString();
  const { error:errCase } = await supabaseClient.from('inspection_case')
    .update({ entrada_at:now, entrada_by: by||null }).eq('id',caseId);
  if (errCase) throw errCase;
  if (autoClose){
    const { error:errClose } = await supabaseClient.from('inspection_case')
      .update({ status:'closed' }).eq('id',caseId);
    if (errClose) throw errClose;
    alert('Entrada guardada y caso cerrado.');
  } else {
    alert('Inspección de entrada guardada.');
  }
}
async function closeCase(caseId){
  const { error } = await supabaseClient.from('inspection_case')
    .update({ status:'closed' }).eq('id',caseId);
  if (error){ alert(error.message); return; }
  alert('Caso cerrado y almacenado.');
}

// === Photos ===
async function uploadPhoto(caseId, phase, file){
  const name=`${caseId}/${phase}/${Date.now()}_${file.name}`;
  const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(name, file, { upsert:false });
  if (error) throw error;
  const { data:pub } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(name);
  const url=pub.publicUrl;
  const ins = await supabaseClient.from('inspection_photos')
    .insert({ case_id:caseId, phase, url, uploaded_by:null });
  if (ins.error) throw ins.error;
  return url;
}
async function listPhotos(caseId, phase){
  const { data, error } = await supabaseClient.from('inspection_photos')
    .select('*').eq('case_id',caseId).eq('phase',phase).order('created_at',{ascending:false});
  if (error) throw error;
  return data||[];
}
function renderPhotos(containerId, items){
  const el=document.getElementById(containerId);
  el.innerHTML=(items||[]).map(i=>`<a href="${i.url}" target="_blank"><img src="${i.url}" alt="foto"/></a>`).join('');
}

// Exports (mantener API usada por tus páginas)
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
window.closeCase=closeCase;
window.uploadPhoto=uploadPhoto;
window.listPhotos=listPhotos;
window.renderPhotos=renderPhotos;
