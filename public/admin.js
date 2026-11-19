/* =========================================================
   PANEL DE CONTROL — solo para el administrador (email + contraseña).
   Datos en Supabase a través de store.js (Store, Config, Fotos, Auth).
   ========================================================= */
const $ = s => document.querySelector(s);
const fmt = n => new Intl.NumberFormat("es-AR").format(n || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const ESTADOS = [
  {id:"disponible", label:"Disponible",    corto:"Disp."},
  {id:"nueva",      label:"Nuevo ingreso", corto:"Nuevo"},
  {id:"reservada",  label:"Reservada",     corto:"Reserv."},
  {id:"vendida",    label:"Vendida",       corto:"Vend."},
];
const ICON = {
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4M6.6 6.6C3.2 8.6 1 12 1 12s4 7 11 7a10 10 0 0 0 5.4-1.6"/></svg>',
};
let TODAS = [];                    // propiedades (incluidas las ocultas)
let CFGA = { ...Config.DEFAULTS }; // perfil y textos
let filtroEstado = "todas", q = "";

function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'), 2400); }
// Ejecuta una acción mostrando "Guardando…" en el botón y avisando si falla
async function conEspera(btn, texto, fn){
  const antes = btn?.textContent;
  if (btn){ btn.disabled = true; btn.textContent = texto; }
  try { return await fn(); }
  catch (err){ console.error(err); toast("No se pudo guardar: " + err.message); throw err; }
  finally { if (btn){ btn.disabled = false; btn.textContent = antes; } }
}

/* =========================================================
   INGRESO
   ========================================================= */
function mostrarLogin(msg){
  $('#login').classList.add('open');
  $('#login-form').hidden = false; $('#newpass-form').hidden = true;
  $('#login-err').textContent = msg || "";
  if (MODO_DEMO) $('#login-sub').textContent = "Modo demo: cualquier email y contraseña sirven.";
  setTimeout(()=>$('#l-email').focus(), 50);
}
function ocultarLogin(){ $('#login').classList.remove('open'); }

$('#login-form').onsubmit = async e=>{
  e.preventDefault();
  const email = $('#l-email').value.trim(), pass = $('#l-pass').value;
  if (!email || !pass){ $('#login-err').textContent = "Completá email y contraseña."; return; }
  const btn = $('#l-go'); btn.disabled = true; btn.textContent = "Entrando…";
  try { await Auth.entrar(email, pass); $('#l-pass').value = ""; await iniciar(); }
  catch (err){ $('#login-err').textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = "Entrar"; }
};
$('#l-forgot').onclick = async ()=>{
  const email = $('#l-email').value.trim();
  if (!email){ $('#login-err').textContent = "Escribí tu email y tocá de nuevo “Olvidé mi contraseña”."; $('#l-email').focus(); return; }
  try { await Auth.recuperar(email); $('#login-err').textContent = ""; toast("Te mandamos un email para crear una contraseña nueva"); }
  catch (err){ $('#login-err').textContent = err.message; }
};
// Al volver desde el email de recuperación, Supabase avisa con PASSWORD_RECOVERY
Auth.alCambiar(evento=>{
  if (evento === "PASSWORD_RECOVERY"){
    $('#login').classList.add('open'); $('#login-form').hidden = true; $('#newpass-form').hidden = false;
    $('#login-sub').textContent = "Elegí tu nueva contraseña.";
  }
});
$('#newpass-form').onsubmit = async e=>{
  e.preventDefault();
  const p = $('#np-pass').value;
  if (p.length < 8){ $('#np-err').textContent = "Tiene que tener al menos 8 caracteres."; return; }
  try { await Auth.cambiarPassword(p); toast("Contraseña actualizada"); await iniciar(); }
  catch (err){ $('#np-err').textContent = err.message; }
};
$('#logout').onclick = async ()=>{ await Auth.salir(); location.reload(); };

async function iniciar(){
  const u = await Auth.usuario();
  if (!u){ mostrarLogin(); return; }
  if (!(await Auth.esAdmin())){
    await Auth.salir();
    mostrarLogin("Ese usuario no tiene permiso de administrador. Agregá tu email a la tabla “admins” en Supabase.");
    return;
  }
  ocultarLogin();
  $('#foot').innerHTML = MODO_DEMO
    ? `<b>Modo demo:</b> los cambios se guardan solo en este navegador.<br>Completá <code>config.js</code> para conectar tu Supabase.`
    : `Conectado como ${esc(u.email)}`;
  if (MODO_DEMO && !$('.demo-banner')) document.body.insertAdjacentHTML('afterbegin', '<div class="demo-banner">Modo demo · completá config.js para usar tu Supabase</div>');
  try {
    [TODAS, CFGA] = await Promise.all([Store.all(), Config.get()]);
  } catch (err){ console.error(err); toast("No se pudieron cargar los datos: " + err.message); }
  render(); renderProfile(); cargarSubs();
}
async function recargar(){ TODAS = await Store.all(); render(); }

/* =========================================================
   LISTADO
   ========================================================= */
function render(){
  const all = TODAS;
  const n = e => all.filter(p=>p.estado===e || (e==="disponible" && p.estado==="nueva")).length;
  const S = [
    {id:"todas", n:all.length, l:"Todas"},
    {id:"disponible", n:n("disponible"), l:"Disponibles"},
    {id:"reservada", n:n("reservada"), l:"Reservadas"},
    {id:"vendida", n:n("vendida"), l:"Vendidas"},
  ];
  $('#stats').innerHTML = S.map(s=>`<button class="stat" data-s="${s.id}" aria-pressed="${s.id===filtroEstado}"><b>${s.n}</b><span>${s.l}</span></button>`).join("");

  if (!all.length){
    $('#list').innerHTML = `<div class="empty">Todavía no cargaste propiedades.<br>Tocá <b>“Nueva propiedad”</b> para empezar.<br><br>
      <button class="btn btn-ghost" type="button" id="seed">Cargar propiedades de ejemplo</button></div>`;
    return;
  }
  const qq = q.trim().toLowerCase();
  const items = all.filter(p =>
    (filtroEstado==="todas" || p.estado===filtroEstado || (filtroEstado==="disponible" && p.estado==="nueva")) &&
    (!qq || [p.titulo,p.barrio,p.codigo].join(" ").toLowerCase().includes(qq)));

  $('#list').innerHTML = items.length ? items.map(p=>{
    const gris = p.estado==="reservada"||p.estado==="vendida";
    return `<article class="row ${p.publicada===false?'hidden-prop':''}" data-c="${esc(p.codigo)}">
      <div class="row-head">
        <div class="thumb ${gris?'gris':''}">${p.fotos?.[0]?`<img src="${esc(p.fotos[0])}" alt="" loading="lazy">`:""}${gris?`<span class="tag">${p.estado}</span>`:""}</div>
        <div class="info">
          <b>${esc(p.titulo) || "Sin título"}</b>
          <div class="p">${p.tipo==="Desarrollo en pozo"?"Desde ":""}${esc(p.moneda)} ${fmt(p.precio)}</div>
          <div class="c">${esc(p.codigo)} · ${esc(p.barrio) || "—"}${p.etiqueta?` · ${esc(p.etiqueta)}`:""}${p.publicada===false?" · <strong>Oculta</strong>":""}</div>
        </div>
        <div class="acts">
          <button class="ib" data-edit aria-label="Editar ${esc(p.titulo)}">${ICON.edit}</button>
          <button class="ib" data-vis aria-label="${p.publicada===false?'Mostrar en la galería':'Ocultar de la galería'}">${p.publicada===false?ICON.eyeOff:ICON.eye}</button>
        </div>
      </div>
      <div class="seg" role="group" aria-label="Estado de ${esc(p.titulo)}">
        ${ESTADOS.map(e=>`<button data-e="${e.id}" aria-pressed="${p.estado===e.id}">${e.corto}</button>`).join("")}
      </div>
    </article>`}).join("") : `<p class="empty">No hay propiedades para mostrar.</p>`;
}

document.addEventListener('click', async e=>{
  const s = e.target.closest('[data-s]');
  if (s){ filtroEstado = s.dataset.s; render(); return; }
  if (e.target.closest('#seed')){
    const b = e.target.closest('#seed');
    await conEspera(b, "Cargando…", ()=>Store.cargarEjemplos()).catch(()=>{});
    await recargar(); toast("Propiedades de ejemplo cargadas"); return;
  }
  const row = e.target.closest('.row'); if (!row) return;
  const p = TODAS.find(x=>x.codigo===row.dataset.c); if (!p) return;
  const est = e.target.closest('[data-e]');
  if (est){
    const antes = p.estado; p.estado = est.dataset.e; render();      // cambio inmediato en pantalla
    try { await Store.upsert(p); toast(`${p.codigo} → ${ESTADOS.find(x=>x.id===p.estado).label}`); }
    catch (err){ p.estado = antes; render(); toast("No se pudo guardar: " + err.message); }
    return;
  }
  if (e.target.closest('[data-vis]')){
    p.publicada = p.publicada===false; render();
    try { await Store.upsert(p); toast(p.publicada?"Visible en la galería":"Oculta de la galería"); }
    catch (err){ p.publicada = !p.publicada; render(); toast("No se pudo guardar: " + err.message); }
    return;
  }
  if (e.target.closest('[data-edit]')) openEditor(p);
});
$('#q').addEventListener('input', e=>{ q = e.target.value; render(); });
$('#new').onclick = ()=> openEditor(null);

/* =========================================================
   EDITOR DE PROPIEDAD
   ========================================================= */
const form = $('#form');
let editando = null, fotos = [], esNueva = false, subiendo = 0;

$('#f-estado').innerHTML = ESTADOS.map(e=>`<label class="radio"><input type="radio" name="estado" value="${e.id}"><span class="dot" style="background:var(--c-${e.id})"></span>${e.label}</label>`).join("");
$('#f-zona').innerHTML = `<option value="">Elegí una zona</option>` + ZONAS.map(z=>`<option>${z}</option>`).join("");

async function openEditor(p){
  esNueva = !p;
  editando = p ? structuredClone(p)
    : { codigo: await Store.nextCodigo(), estado:"nueva", publicada:true, moneda:"USD", tipo:"Departamento", fotos:[], amenities:[] };
  $('#ed-title').textContent = esNueva ? "Nueva propiedad" : "Editar propiedad";
  $('#del').hidden = esNueva;
  for (const el of form.elements){
    if (!el.name) continue;
    const v = editando[el.name];
    if (el.type==="checkbox") el.checked = el.name==="publicada" ? v!==false : !!v;
    else if (el.type==="radio") el.checked = el.value===editando.estado;
    else if (el.name==="amenities") el.value = (v||[]).join(", ");
    else el.value = v ?? "";
  }
  fotos = [...(editando.fotos||[])];
  renderFotos();
  const pz = editando.pozo || {};
  form.pz_entrega.value = pz.entrega || "";
  form.pz_avance.value = pz.avance ?? "";
  form.pz_fin.value = pz.financiacion || "";
  form.pz_tipos.value = (pz.tipologias||[]).map(t=>`${t.amb} | ${t.m2} | ${t.precio}`).join("\n");
  togglePozo();
  form.zona.value = zonaDe(editando); sugerirBarrios();
  $('#editor').classList.add('open'); $('#editor').scrollTop = 0;
  document.body.style.overflow = "hidden";
  setTimeout(()=>$('#f-titulo').focus({preventScroll:true}), 300);
}
function sugerirBarrios(){
  const z = form.zona.value;
  $('#dl-barrios').innerHTML = (UBICACIONES[z] || []).map(b=>`<option value="${b}">`).join("");
  if (z === "Capital Federal" && !form.ciudad.value) form.ciudad.value = "CABA";
}
form.zona.addEventListener('change', sugerirBarrios);
form.barrio.addEventListener('change', ()=>{ if (!form.zona.value){ const z = zonaDe({ barrio: form.barrio.value }); if (z){ form.zona.value = z; sugerirBarrios(); } } });
function togglePozo(){
  const pozo = form.tipo.value === "Desarrollo en pozo";
  $('#fs-pozo').hidden = !pozo;
  $('#lbl-precio').textContent = pozo ? "Precio desde" : "Precio";
}
form.tipo.addEventListener('change', togglePozo);
function closeEditor(){ $('#editor').classList.remove('open'); document.body.style.overflow = ""; }
$('#ed-close').onclick = closeEditor; $('#ed-cancel').onclick = closeEditor;

// Fotos: se achican y se suben a Supabase Storage apenas las elegís
function renderFotos(){
  $('#photos').innerHTML = fotos.map((f,i)=>`<div class="ph"><img src="${esc(f)}" alt="Foto ${i+1}">
      ${i===0?'<span class="first">Portada</span>':`<button type="button" class="mv" data-first="${i}" aria-label="Usar como portada">★</button>`}
      <button type="button" class="x" data-rm="${i}" aria-label="Quitar foto ${i+1}">×</button></div>`).join("")
    + Array(subiendo).fill('<div class="ph up">Subiendo…</div>').join("")
    + `<label class="add-ph" for="ph-file"><span><b style="font-size:24px;display:block">+</b>Subir fotos</span></label>`;
}
$('#photos').onclick = e=>{
  const rm = e.target.closest('[data-rm]'); if (rm){ fotos.splice(+rm.dataset.rm,1); renderFotos(); return; }
  const fi = e.target.closest('[data-first]'); if (fi){ const [f] = fotos.splice(+fi.dataset.first,1); fotos.unshift(f); renderFotos(); }
};
$('#ph-add').onclick = ()=>{ const u = $('#ph-url').value.trim(); if (/^https:\/\//.test(u)){ fotos.push(u); $('#ph-url').value=""; renderFotos(); } else toast("Pegá un link que empiece con https://"); };
$('#ph-file').onchange = async e=>{
  const files = [...e.target.files]; e.target.value = "";
  subiendo += files.length; renderFotos();
  for (const file of files){
    try { fotos.push(await Fotos.subir(file, "propiedades", { max: 1600 })); }
    catch (err){ console.error(err); toast("No se pudo subir una foto: " + err.message); }
    finally { subiendo--; renderFotos(); }
  }
};

form.onsubmit = async e=>{
  e.preventDefault();
  if (subiendo){ toast("Esperá a que terminen de subirse las fotos"); return; }
  const d = Object.fromEntries(new FormData(form));
  if (!d.titulo?.trim()){ toast("Falta el título"); $('#f-titulo').focus(); return; }
  if (!d.precio){ toast("Falta el precio"); $('#f-precio').focus(); return; }
  const num = k => d[k]==="" || d[k]==null ? null : Number(d[k]);
  const p = { ...editando, ...d,
    precio:num("precio"), expensas:num("expensas")||0, ambientes:num("ambientes")||0, dormitorios:num("dormitorios")||0,
    banos:num("banos")||0, antiguedad:num("antiguedad")||0, m2:num("m2")||0, m2cub:num("m2cub")||0,
    lat:num("lat") ?? -34.6037, lng:num("lng") ?? -58.3816,
    cochera: form.cochera.checked, aptoCredito: form.aptoCredito.checked, publicada: form.publicada.checked,
    publicado: editando.publicado || new Date().toISOString().slice(0,10),
    amenities: d.amenities.split(",").map(s=>s.trim()).filter(Boolean),
    video: d.video.trim() || null, tour360: (d.tour360 || "").trim() || null, fotos };
  if (p.tipo === "Desarrollo en pozo"){
    p.ambMax = num("ambMax") || p.ambientes;
    p.pozo = {
      entrega: d.pz_entrega.trim() || "A confirmar",
      avance: Math.min(100, Math.max(0, num("pz_avance") || 0)),
      financiacion: d.pz_fin.trim(),
      tipologias: d.pz_tipos.split("\n").map(l=>l.split("|").map(s=>s.trim())).filter(x=>x[0])
        .map(([amb,m2,pr])=>({ amb, m2:Number(m2)||0, precio:Number(String(pr||"").replace(/\D/g,""))||0 })),
    };
  } else { delete p.pozo; delete p.ambMax; }
  ["pz_entrega","pz_avance","pz_fin","pz_tipos"].forEach(k=>delete p[k]);
  try {
    await conEspera($('.ed-bar .btn-pri'), "Guardando…", ()=>Store.upsert(p));
    closeEditor(); await recargar(); toast(esNueva ? "Propiedad creada" : "Cambios guardados");
  } catch {}
};
$('#del').onclick = async ()=>{
  if (!confirm(`¿Eliminar "${editando.titulo}"? No se puede deshacer.`)) return;
  try { await conEspera($('#del'), "Eliminando…", ()=>Store.remove(editando.codigo)); closeEditor(); await recargar(); toast("Propiedad eliminada"); } catch {}
};

/* =========================================================
   MI PERFIL Y TEXTOS
   ========================================================= */
const cfgForm = $('#cfg-form');
let cfgFoto = "", subiendoFoto = false;
const avHTML = (foto, nombre) => foto
  ? `<img class="pf-av" src="${esc(foto)}" alt="">`
  : `<span class="pf-av" aria-hidden="true">${esc(Config.iniciales(nombre))}</span>`;
function renderProfile(){
  $('#pf-av-mini').innerHTML = avHTML(CFGA.foto, CFGA.nombre);
  $('#pf-name').textContent = CFGA.nombre;
}
function fillCfg(c){
  for (const k of ["nombre","rol","whatsapp","instagram","titulo","subtitulo","ayudaTitulo","ayudaTituloFicha","ayudaTexto","ayudaBoton","ayudaTituloVacio","ayudaTextoVacio","legalTexto","legalCorredores"]) cfgForm[k].value = c[k] || "";
  [0,1,2].forEach(i => cfgForm["p"+(i+1)].value = (c.ayudaPuntos||[])[i] || "");
  cfgForm.popupActivo.checked = c.popupActivo !== false;
  for (const k of ["popupSegundos","popupTitulo","popupTexto","popupBoton"]) cfgForm[k].value = c[k] ?? "";
  cfgFoto = c.foto || "";
  $('#cfg-av').innerHTML = avHTML(cfgFoto, c.nombre);
}
function openCfg(){ fillCfg(CFGA); $('#cfg').classList.add('open'); $('#cfg').scrollTop = 0; document.body.style.overflow = "hidden"; }
function closeCfg(){ $('#cfg').classList.remove('open'); document.body.style.overflow = ""; }
$('#open-cfg').onclick = openCfg;
$('#cfg-close').onclick = closeCfg; $('#cfg-cancel').onclick = closeCfg;
cfgForm.nombre.addEventListener('input', ()=>{ if (!cfgFoto) $('#cfg-av').innerHTML = avHTML("", cfgForm.nombre.value); });
$('#cfg-file').onchange = async e=>{
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  subiendoFoto = true; $('#cfg-av').innerHTML = `<span class="pf-av" style="font-size:12px">Subiendo…</span>`;
  try { cfgFoto = await Fotos.subir(file, "perfil", { max: 400, cuadrada: true, calidad: 0.85 }); }
  catch (err){ toast("No se pudo subir la foto: " + err.message); }
  finally { subiendoFoto = false; $('#cfg-av').innerHTML = avHTML(cfgFoto, cfgForm.nombre.value); }
};
$('#cfg-rmfoto').onclick = ()=>{ cfgFoto = ""; $('#cfg-av').innerHTML = avHTML("", cfgForm.nombre.value); };
$('#cfg-reset').onclick = ()=>{
  if (!confirm("¿Volver a los textos originales? Tu foto, nombre y WhatsApp se mantienen.")) return;
  const cur = { nombre:cfgForm.nombre.value, rol:cfgForm.rol.value, whatsapp:cfgForm.whatsapp.value };
  fillCfg({ ...Config.DEFAULTS, ...cur, foto: cfgFoto });
};
cfgForm.onsubmit = async e=>{
  e.preventDefault();
  if (subiendoFoto){ toast("Esperá a que termine de subirse la foto"); return; }
  const d = Object.fromEntries(new FormData(cfgForm));
  const wa = String(d.whatsapp||"").replace(/\D/g,"");
  if (wa.length < 10){ toast("Revisá el número de WhatsApp"); cfgForm.whatsapp.focus(); return; }
  const D = Config.DEFAULTS;
  const cfg = {
    nombre: d.nombre.trim() || D.nombre, rol: d.rol.trim(), whatsapp: wa, foto: cfgFoto,
    instagram: (d.instagram || "").trim().replace(/^@?/, d.instagram.trim() ? "@" : ""),
    titulo: d.titulo.trim() || D.titulo, subtitulo: d.subtitulo.trim(),
    ayudaTitulo: d.ayudaTitulo.trim() || D.ayudaTitulo,
    ayudaTituloFicha: d.ayudaTituloFicha.trim() || D.ayudaTituloFicha,
    ayudaTexto: d.ayudaTexto.trim(), ayudaBoton: d.ayudaBoton.trim() || D.ayudaBoton,
    ayudaPuntos: [d.p1, d.p2, d.p3].map(s=>s.trim()),
    ayudaTituloVacio: d.ayudaTituloVacio.trim() || D.ayudaTituloVacio,
    ayudaTextoVacio: d.ayudaTextoVacio.trim() || D.ayudaTextoVacio,
    popupActivo: cfgForm.popupActivo.checked,
    popupSegundos: Math.min(300, Math.max(3, Number(d.popupSegundos) || D.popupSegundos)),
    popupTitulo: d.popupTitulo.trim() || D.popupTitulo,
    popupTexto: d.popupTexto.trim() || D.popupTexto,
    popupBoton: d.popupBoton.trim() || D.popupBoton,
    // El texto legal es obligatorio: si lo dejan vacío vuelve al original
    legalTexto: d.legalTexto.trim() || D.legalTexto,
    legalCorredores: d.legalCorredores.trim() || D.legalCorredores,
  };
  try {
    await conEspera($('#cfg .ed-bar .btn-pri'), "Guardando…", ()=>Config.save(cfg));
    CFGA = cfg; closeCfg(); renderProfile(); toast("Perfil y textos guardados");
  } catch {}
};

/* =========================================================
   SUSCRIPTORES
   ========================================================= */
let SUBS = [];
const fecha = iso => new Date(iso).toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric" });
async function cargarSubs(){
  try { SUBS = await Suscriptores.listar(); }
  catch (err){ console.error(err); SUBS = []; toast("No se pudo leer la lista. ¿Ejecutaste supabase/suscriptores.sql?"); }
  $('#subs-n').textContent = SUBS.length ? `(${SUBS.length})` : "";
}
function renderSubs(){
  $('#subs-title').textContent = `Suscriptores (${SUBS.length})`;
  $('#subs-list').innerHTML = SUBS.length ? SUBS.map(s=>`<div class="sub">
      <div><b>${esc(s.email)}</b><span>${[s.interes, s.zona, fecha(s.created_at)].filter(Boolean).map(esc).join(" · ")}</span></div>
      <button class="ib" type="button" data-sub-rm="${s.id}" aria-label="Borrar ${esc(s.email)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </div>`).join("") : `<p class="empty">Todavía no hay suscriptores.<br>Van a aparecer acá cuando alguien deje su email en la galería.</p>`;
}
$('#open-subs').onclick = async ()=>{
  await cargarSubs(); renderSubs();
  $('#subs').classList.add('open'); $('#subs').scrollTop = 0; document.body.style.overflow = "hidden";
};
function closeSubs(){ $('#subs').classList.remove('open'); document.body.style.overflow = ""; }
$('#subs-close').onclick = closeSubs;
$('#subs-list').onclick = async e=>{
  const b = e.target.closest('[data-sub-rm]'); if (!b) return;
  const s = SUBS.find(x=>String(x.id)===b.dataset.subRm);
  if (!s || !confirm(`¿Borrar a ${s.email} de la lista? No se puede deshacer.`)) return;
  try { await Suscriptores.borrar(s.id); await cargarSubs(); renderSubs(); toast("Suscriptor borrado"); }
  catch (err){ toast("No se pudo borrar: " + err.message); }
};
$('#subs-csv').onclick = ()=>{
  if (!SUBS.length){ toast("Todavía no hay suscriptores"); return; }
  const q = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const csv = ["email,interes,zona,origen,fecha", ...SUBS.map(s=>[s.email,s.interes,s.zona,s.origen,fecha(s.created_at)].map(q).join(","))].join("\r\n");
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `suscriptores-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
};
$('#subs-copy').onclick = async ()=>{
  if (!SUBS.length){ toast("Todavía no hay suscriptores"); return; }
  const txt = SUBS.map(s=>s.email).join(", ");
  try { await navigator.clipboard.writeText(txt); toast(`${SUBS.length} emails copiados`); }
  catch { prompt("Copiá los emails:", txt); }
};

document.addEventListener('keydown', e=>{
  if (e.key !== "Escape") return;
  if ($('#subs').classList.contains('open')) closeSubs();
  if ($('#editor').classList.contains('open')) closeEditor();
  if ($('#cfg').classList.contains('open')) closeCfg();
});

iniciar();
