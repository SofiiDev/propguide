/* =========================================================
   IMPORTAR DESDE CARPETA
   Elegís la carpeta "Propiedades" de tu computadora (una subcarpeta por
   propiedad, con fotos, video .mp4 y un .txt). El panel:
     1. agrupa los archivos por carpeta,
     2. lee el .txt (campos "Campo: valor" + descripción libre),
     3. te muestra una vista previa para revisar,
     4. sube fotos (achicadas), video y la propiedad a Supabase.
   Usa funciones de admin.js ($, esc, fmt, toast, recargar) y store.js.
   ========================================================= */
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const VID_EXT = /\.(mp4|mov|webm)$/i;
let IMPORT = [];        // propiedades detectadas
let importando = false;

/* ---------- Leer el .txt ---------- */
const sinTildes = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Nombres posibles de cada campo (sin tildes, en minúscula)
const CAMPOS = {
  titulo: ["titulo", "title", "nombre"],
  tipo: ["tipo", "tipo de propiedad"],
  precio: ["precio", "valor", "precio desde"],
  moneda: ["moneda"],
  expensas: ["expensas"],
  zona: ["zona", "provincia", "provincia o zona"],
  barrio: ["barrio", "localidad", "barrio o localidad"],
  ciudad: ["ciudad"],
  direccion: ["direccion", "direccion aproximada", "ubicacion"],
  ambientes: ["ambientes", "amb"],
  ambMax: ["ambientes hasta"],
  dormitorios: ["dormitorios", "dorm", "habitaciones"],
  banos: ["banos", "bano"],
  m2: ["superficie total", "m2 totales", "m2", "superficie", "sup total", "metros"],
  m2cub: ["superficie cubierta", "m2 cubiertos", "sup cubierta", "cubiertos"],
  antiguedad: ["antiguedad"],
  cochera: ["cochera", "cocheras"],
  aptoCredito: ["apto credito", "credito"],
  disposicion: ["disposicion", "orientacion"],
  amenities: ["destacados", "amenities", "caracteristicas"],
  estado: ["estado"],
  etiqueta: ["etiqueta"],
  video: ["video", "tour", "link video", "youtube"],
  codigo: ["codigo", "cod"],
  lat: ["latitud", "lat"],
  lng: ["longitud", "lng", "lon"],
  entrega: ["entrega", "entrega estimada", "posesion"],
  avance: ["avance", "avance de obra"],
  financiacion: ["financiacion"],
  unidades: ["unidades", "tipologias", "unidades disponibles"],
  descripcion: ["descripcion", "detalle", "texto"],
};
const CLAVE = {};
for (const [campo, alias] of Object.entries(CAMPOS)) for (const a of alias) CLAVE[a] = campo;

const numero = v => { const d = String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); const n = parseFloat(d); return isNaN(n) ? null : n; };
const siNo = v => /^(si|sí|s|yes|true|x|1|tiene|con)\b/i.test(sinTildes(v));
const monedaDe = v => /usd|u\$s|us\$|dolar/i.test(v) ? "USD" : /ars|peso|\$/i.test(v) ? "ARS" : null;
const TIPOS_TXT = [
  [/desarrollo|en pozo|emprendimiento/, "Desarrollo en pozo"], [/\bph\b/, "PH"], [/casa|chalet|duplex/, "Casa"],
  [/terreno|lote/, "Terreno"], [/local|oficina/, "Local"], [/depto|departamento|monoambiente|semipiso|piso/, "Departamento"],
];
const ESTADOS_TXT = [[/reserv/, "reservada"], [/vendid/, "vendida"], [/nuev/, "nueva"], [/dispon/, "disponible"]];

// Lee un archivo de texto: prueba UTF-8 y, si falla, el formato viejo de Windows (para que no se rompan las tildes)
async function leerTexto(file){
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

function interpretarTxt(texto, carpeta){
  const p = {}, desc = [];
  let enDescripcion = false;
  const cuerpo = texto.split(/\r?\n-{8,}/)[0];          // se ignoran las instrucciones de la plantilla
  for (const linea of cuerpo.split(/\r?\n/)) {
    const m = linea.match(/^\s*([^:]{2,30}):\s*(.*)$/);
    const campo = m && CLAVE[sinTildes(m[1])];
    if (campo && campo !== "descripcion" && !enDescripcion) { p[campo] = m[2].trim(); continue; }
    if (campo === "descripcion") { enDescripcion = true; if (m[2].trim()) desc.push(m[2].trim()); continue; }
    desc.push(linea);
  }
  p.descripcion = desc.join("\n").replace(/^\s+|\s+$/g, "").replace(/\n{3,}/g, "\n\n");

  // Si no hay campos, se buscan en el texto libre
  const todo = sinTildes(texto + " " + carpeta);
  const out = { estado: "nueva", publicada: false, moneda: "USD", fotos: [], amenities: [] };
  out.titulo = p.titulo || carpeta;
  const tipoTxt = sinTildes(p.tipo || "") || todo;
  out.tipo = (TIPOS_TXT.find(([re]) => re.test(tipoTxt)) || [, "Departamento"])[1];

  const precioTxt = p.precio || (texto.match(/(USD|U\$S|US\$)\s*[\d.,]+/i) || [""])[0];
  out.precio = numero(precioTxt);
  out.moneda = monedaDe(p.moneda || precioTxt) || "USD";
  out.expensas = numero(p.expensas) || 0;

  const n = (campo, re) => p[campo] != null ? numero(p[campo]) : (todo.match(re) ? numero(todo.match(re)[1]) : null);
  out.ambientes = p.ambientes != null
    ? (/mono/.test(sinTildes(p.ambientes)) ? 1 : numero(p.ambientes) || 0)
    : (/monoambiente/.test(todo) ? 1 : n("ambientes", /(\d+)\s*amb/) || 0);
  out.dormitorios = n("dormitorios", /(\d+)\s*(dormitorios?|dorm|habitaciones)/) || 0;
  out.banos = n("banos", /(\d+)\s*banos?/) || 0;
  out.m2 = n("m2", /(\d+[.,]?\d*)\s*(m2|m²|mts)/) || 0;
  out.m2cub = numero(p.m2cub) || out.m2;
  out.antiguedad = p.antiguedad != null ? (/estrenar/.test(sinTildes(p.antiguedad)) ? 0 : numero(p.antiguedad) || 0) : (/a estrenar/.test(todo) ? 0 : 0);
  out.cochera = p.cochera != null ? siNo(p.cochera) : /cochera/.test(todo);
  out.aptoCredito = p.aptoCredito != null ? siNo(p.aptoCredito) : /apto\s*credito/.test(todo);
  out.disposicion = p.disposicion || "";
  out.direccion = p.direccion || "";
  out.ciudad = p.ciudad || "";
  out.amenities = (p.amenities || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
  out.etiqueta = p.etiqueta || "";
  out.video = /^https?:\/\//.test(p.video || "") ? p.video.trim() : null;
  if (p.codigo) out.codigo = p.codigo.trim();
  if (p.lat) out.lat = numero(p.lat); if (p.lng) out.lng = numero(p.lng);
  if (p.estado) out.estado = (ESTADOS_TXT.find(([re]) => re.test(sinTildes(p.estado))) || [, "nueva"])[1];
  out.descripcion = p.descripcion;

  // Ubicación: lo que diga el .txt o, si no, un barrio conocido que aparezca en el nombre de la carpeta o el texto
  out.barrio = p.barrio || "";
  out.zona = p.zona ? (ZONAS.find(z => sinTildes(z) === sinTildes(p.zona)) || p.zona) : "";
  if (!out.barrio) {
    const conocidos = ZONAS.flatMap(z => UBICACIONES[z].map(b => [b, z])).sort((a, b) => b[0].length - a[0].length);
    const hit = conocidos.find(([b]) => new RegExp(`\\b${sinTildes(b).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(todo));
    if (hit) { out.barrio = hit[0]; out.zona = out.zona || hit[1]; }
  }
  if (!out.zona) out.zona = zonaDe(out);
  if (out.zona === "Capital Federal" && !out.ciudad) out.ciudad = "CABA";

  // Desarrollo en pozo
  if (out.tipo === "Desarrollo en pozo") {
    out.ambMax = numero(p.ambMax) || out.ambientes;
    out.pozo = {
      entrega: p.entrega || "A confirmar",
      avance: Math.min(100, Math.max(0, numero(p.avance) || 0)),
      financiacion: p.financiacion || "",
      tipologias: String(p.unidades || "").split(";").map(u => u.split("|").map(s => s.trim())).filter(x => x[0])
        .map(([amb, m2, pr]) => ({ amb, m2: numero(m2) || 0, precio: numero(pr) || 0 })),
    };
  }
  return out;
}

/* ---------- Agrupar archivos por carpeta ---------- */
async function analizarCarpeta(files){
  const grupos = new Map();
  for (const f of files) {
    const partes = (f.webkitRelativePath || f.name).split("/");
    if (partes.some(x => x.startsWith(".") || x === "__MACOSX")) continue;    // archivos ocultos
    const carpeta = partes.length > 1 ? partes.slice(0, -1).join("/") : "(sin carpeta)";
    if (!grupos.has(carpeta)) grupos.set(carpeta, { carpeta, nombre: partes[partes.length - 2] || carpeta, fotos: [], videos: [], txt: [] });
    const g = grupos.get(carpeta);
    if (IMG_EXT.test(f.name)) g.fotos.push(f);
    else if (VID_EXT.test(f.name)) g.videos.push(f);
    else if (/\.txt$/i.test(f.name)) g.txt.push(f);
  }
  const lista = [];
  for (const g of grupos.values()) {
    if (!g.fotos.length && !g.txt.length) continue;     // carpeta sin nada útil (por ejemplo la raíz)
    const texto = g.txt.length ? await leerTexto(g.txt[0]) : "";
    const p = interpretarTxt(texto, g.nombre);
    // Orden de fotos: "portada" primero, después por nombre (foto2 antes que foto10)
    g.fotos.sort((a, b) => (/portada|principal|cover/i.test(b.name) - /portada|principal|cover/i.test(a.name)) || a.name.localeCompare(b.name, "es", { numeric: true }));
    const video = g.videos[0] || null;
    const avisos = [];
    if (!g.txt.length) avisos.push("No tiene .txt: se usa el nombre de la carpeta como título");
    if (!p.precio) avisos.push("Falta el precio");
    if (!p.barrio) avisos.push("No se detectó el barrio");
    if (!g.fotos.length) avisos.push("No tiene fotos");
    if (video && !Videos.entra(video)) avisos.push(`El video pesa ${(video.size / 1048576).toFixed(0)} MB (máx. ${Videos.MAX_MB}): subilo a YouTube y agregá "Video: link" al .txt`);
    if (g.videos.length > 1) avisos.push("Hay más de un video: se usa el primero");
    if (p.codigo && TODAS.some(x => x.codigo === p.codigo)) avisos.push(`El código ${p.codigo} ya existe: se va a reemplazar`);
    lista.push({ ...g, p, video, avisos, incluir: !!(p.precio && g.fotos.length), estadoImp: "" });
  }
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
}

/* ---------- Pantalla ---------- */
function renderImport(){
  const n = IMPORT.filter(x => x.incluir).length;
  $('#imp-paso1').hidden = IMPORT.length > 0;
  $('#imp-paso2').hidden = IMPORT.length === 0;
  $('#imp-go').textContent = importando ? "Importando…" : `Importar ${n} ${n === 1 ? "propiedad" : "propiedades"}`;
  $('#imp-go').disabled = importando || !n;
  $('#imp-resumen').textContent = `${IMPORT.length} ${IMPORT.length === 1 ? "carpeta encontrada" : "carpetas encontradas"} · ${n} para importar`;
  $('#imp-list').innerHTML = IMPORT.map((x, i) => {
    const p = x.p, thumb = x.fotos[0] ? (x._thumb ||= URL.createObjectURL(x.fotos[0])) : "";
    const amb = p.ambMax > p.ambientes ? `${p.ambientes} a ${p.ambMax} amb.` : p.ambientes ? `${p.ambientes} amb.` : "";
    const datos = [p.tipo, amb, p.m2 ? `${p.m2} m²` : "", p.barrio].filter(Boolean).join(" · ");
    const nf = x.fotos.length;
    return `<article class="imp-item ${x.incluir ? "" : "off"}">
      <label class="imp-chk"><input type="checkbox" data-imp="${i}" ${x.incluir ? "checked" : ""} ${importando ? "disabled" : ""} aria-label="Importar ${esc(p.titulo)}"></label>
      <div class="imp-th">${thumb ? `<img src="${thumb}" alt="">` : ""}</div>
      <div class="imp-info">
        <b>${esc(p.titulo)}</b>
        <span>${esc(datos) || "Sin datos"}</span>
        <span>${p.precio ? `${p.tipo === "Desarrollo en pozo" ? "Desde " : ""}${p.moneda} ${fmt(p.precio)}` : "<em>Sin precio</em>"} · ${nf} ${nf === 1 ? "foto" : "fotos"}${x.video && Videos.entra(x.video) ? " · video" : p.video ? " · video (link)" : ""}</span>
        ${x.avisos.length ? `<ul class="imp-av">${x.avisos.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
        ${x.estadoImp ? `<p class="imp-st ${x.estadoImp.startsWith("✓") ? "ok" : x.estadoImp.startsWith("✕") ? "err" : ""}">${esc(x.estadoImp)}</p>` : ""}
      </div>
    </article>`;
  }).join("");
}
function abrirImport(){ IMPORT = []; renderImport(); $('#imp').classList.add('open'); $('#imp').scrollTop = 0; document.body.style.overflow = "hidden"; }
function cerrarImport(){
  if (importando && !confirm("La importación sigue en curso. ¿Cerrar igual? Lo que ya se subió queda guardado.")) return;
  IMPORT.forEach(x => x._thumb && URL.revokeObjectURL(x._thumb));
  $('#imp').classList.remove('open'); document.body.style.overflow = "";
}
$('#open-imp').onclick = abrirImport;
$('#imp-close').onclick = cerrarImport;
$('#imp-cancel').onclick = cerrarImport;
$('#imp-otra').onclick = ()=>{ if (!importando){ IMPORT = []; renderImport(); } };
$('#imp-dir').onchange = async e=>{
  const files = [...e.target.files]; e.target.value = "";
  if (!files.length) return;
  $('#imp-cargando').hidden = false;
  try { IMPORT = await analizarCarpeta(files); }
  catch (err){ console.error(err); toast("No se pudo leer la carpeta: " + err.message); IMPORT = []; }
  finally { $('#imp-cargando').hidden = true; }
  if (!IMPORT.length) toast("No encontré propiedades: cada una tiene que estar en su carpeta, con fotos o un .txt");
  renderImport();
};
$('#imp-list').onchange = e=>{ const c = e.target.closest('[data-imp]'); if (c){ IMPORT[+c.dataset.imp].incluir = c.checked; renderImport(); } };

/* ---------- Importar ---------- */
$('#imp-go').onclick = async ()=>{
  const items = IMPORT.filter(x => x.incluir);
  if (!items.length || importando) return;
  const publicar = $('#imp-publicar').checked;
  importando = true; renderImport();
  // Códigos nuevos correlativos (NX-121, NX-122…) para las que no traen código
  let ultimo = Math.max(100, ...TODAS.map(p => parseInt(String(p.codigo).replace(/\D/g, ""), 10) || 0));
  let ok = 0;
  for (const x of items) {
    try {
      const p = { ...x.p, publicada: publicar, publicado: new Date().toISOString().slice(0, 10) };
      if (!p.codigo) p.codigo = "NX-" + String(++ultimo).padStart(3, "0");
      p.fotos = [];
      for (let i = 0; i < x.fotos.length; i++) {
        x.estadoImp = `Subiendo fotos ${i + 1} de ${x.fotos.length}…`; renderImport();
        try { p.fotos.push(await Fotos.subir(x.fotos[i], "propiedades", { max: 1600 })); }
        catch (err) { console.error(err); x.avisos.push(`No se pudo subir ${x.fotos[i].name}`); }
      }
      if (x.video && Videos.entra(x.video) && !p.video) {
        x.estadoImp = `Subiendo video (${(x.video.size / 1048576).toFixed(0)} MB)…`; renderImport();
        try { p.video = await Videos.subir(x.video); }
        catch (err) { console.error(err); x.avisos.push("No se pudo subir el video: " + err.message); }
      }
      x.estadoImp = "Guardando…"; renderImport();
      await Store.upsert(p);
      x.estadoImp = `✓ Importada como ${p.codigo}${publicar ? "" : " (oculta, para revisar)"}`; ok++;
    } catch (err) {
      console.error(err); x.estadoImp = "✕ " + err.message;
    }
    x.incluir = false; renderImport();
  }
  importando = false; renderImport();
  $('#imp-go').textContent = "Listo"; $('#imp-go').disabled = true;
  await recargar();
  toast(`${ok} ${ok === 1 ? "propiedad importada" : "propiedades importadas"}`);
};
