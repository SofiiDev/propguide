/* =========================================================
   IMPORTAR DESDE CARPETA
   Elegís la carpeta con tus propiedades (una subcarpeta por propiedad).
   Entiende dos formatos:
     · La exportación de teamnexia: descripcion.txt + info.txt + fotos/ + video/
       + "Tour virtual.url" (+ ESTADO.txt si ya no está publicada).
     · La plantilla propia: ficha.txt con "Campo: valor" + fotos + video .mp4.
   El panel agrupa los archivos, interpreta los datos, muestra una vista previa
   y sube fotos (achicadas), video y la propiedad a Supabase.
   Usa funciones de admin.js ($, esc, fmt, toast, recargar) y store.js.
   ========================================================= */
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const VID_EXT = /\.(mp4|mov|webm)$/i;
// Subcarpetas que son parte de una propiedad (no una propiedad aparte)
const SUBCARPETA = /^(fotos?|imagenes|images|img|video|videos|tour|media|planos?)$/i;
let IMPORT = [];        // propiedades detectadas
let importando = false;

/* ---------- Utilidades de texto ---------- */
const sinTildes = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const numero = v => {
  const d = String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(d); return isNaN(n) ? null : n;
};
const siNo = v => { const t = sinTildes(v); return /^\d/.test(t) ? numero(t) > 0 : /^(si|s|yes|true|x|tiene|con|cubiert|descubiert)/.test(t); };
const monedaDe = v => /usd|u\$s|us\$|dolar/i.test(v) ? "USD" : /ars|peso|\$/i.test(v) ? "ARS" : null;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Lee un archivo de texto: prueba UTF-8 y, si falla, el formato viejo de Windows (para que no se rompan las tildes)
async function leerTexto(file){
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

/* ---------- Campos reconocidos (sin tildes, en minúscula) ---------- */
const CAMPOS = {
  titulo: ["titulo", "title", "nombre", "propiedad"],
  tipo: ["tipo", "tipo de propiedad"],
  precio: ["precio", "valor", "precio desde"],
  moneda: ["moneda"],
  expensas: ["expensas"],
  zona: ["zona", "provincia", "provincia o zona"],
  barrio: ["barrio", "localidad", "barrio o localidad", "localidad o barrio"],
  ciudad: ["ciudad", "partido"],
  direccion: ["direccion", "direccion aproximada"],
  ambientes: ["ambientes", "ambiente", "amb"],
  ambMax: ["ambientes hasta"],
  dormitorios: ["dormitorios", "dormitorio", "dorm", "habitaciones"],
  banos: ["banos", "bano"],
  m2: ["superficie total", "sup. total", "sup total", "m2 totales", "m2", "superficie", "metros"],
  m2cub: ["superficie cubierta", "sup. cubierta", "sup cubierta", "m2 cubiertos", "cubiertos"],
  antiguedad: ["antiguedad"],
  cochera: ["cochera", "cocheras", "tipo de cochera"],
  aptoCredito: ["apto credito", "credito"],
  disposicion: ["disposicion"],
  amenities: ["destacados", "amenities"],
  estado: ["estado"],
  etiqueta: ["etiqueta"],
  video: ["video", "link video", "youtube"],
  tour360: ["tour virtual", "tour 360", "tour", "recorrido virtual"],
  codigo: ["codigo", "cod", "id"],
  lat: ["latitud", "lat"],
  lng: ["longitud", "lng", "lon"],
  entrega: ["entrega", "entrega estimada", "posesion"],
  avance: ["avance", "avance de obra"],
  financiacion: ["financiacion"],
  unidades: ["unidades", "tipologias", "unidades disponibles"],
  descripcion: ["descripcion", "detalle"],
};
const CLAVE = {};
for (const [campo, alias] of Object.entries(CAMPOS)) for (const a of alias) CLAVE[a] = campo;

// Equivalencias con la exportación de teamnexia
const TIPOS_TXT = [
  [/desarrollo|en pozo|emprendimiento/, "Desarrollo en pozo"], [/\bphs?\b/, "PH"], [/casa|chalet|duplex/, "Casa"],
  [/terreno|lote/, "Terreno"], [/oficina/, "Oficina"], [/local/, "Local"],
  [/depto|departamento|monoambiente|semipiso|piso/, "Departamento"],
];
const ESTADOS_TXT = [[/reserv/, "reservada"], [/vendid/, "vendida"], [/nuev/, "nueva"], [/dispon|venta/, "disponible"]];
function zonaDesde(txt){
  const t = sinTildes(txt).replace(/\./g, "");
  if (/capital federal|caba|ciudad autonoma/.test(t)) return "Capital Federal";
  if (/gba\s*norte|zona norte/.test(t)) return "GBA Norte";
  if (/gba\s*oeste|zona oeste/.test(t)) return "GBA Oeste";
  if (/gba\s*sur|zona sur/.test(t)) return "GBA Sur";
  if (/costa/.test(t)) return "Buenos Aires Costa Atlántica";
  if (/interior/.test(t)) return "Buenos Aires Interior";
  return ZONAS.find(z => sinTildes(z) === t) || "";
}
// Servicios básicos que no aportan como "característica destacada"
const BASICOS = /^(agua corriente|alumbrado publico|cable tv|cordon cuneta|desague cloacal|gas natural|internet|luz|pavimento|telefono|wifi|cocina|comedor|living|lavadero)$/;
// "VENTA CASA 6 AMBIENTES EN SAN CARLOS" → "Casa 6 ambientes en San Carlos"
const LUGARES = Object.values(UBICACIONES).flat().concat(ZONAS).sort((a, b) => b.length - a.length);
// Pone en mayúscula los nombres de lugares (compara sin tildes: "petion" → "Petión", "san carlos" → "San Carlos")
function capitalizarLugares(s, extra = []){
  let out = s.normalize("NFC");
  const nombres = [...new Set([...extra.filter(Boolean).flatMap(x => [x, ...x.split(/\s+/).filter(w => w.length > 3)]), ...LUGARES])]
    .map(x => x.normalize("NFC")).sort((a, b) => b.length - a.length);
  for (const l of nombres) {
    const norm = sinTildes(out);                         // mismo largo que "out" (texto NFC)
    const re = new RegExp(`(^|[^a-z0-9])(${reEsc(sinTildes(l))})(?=$|[^a-z0-9])`, "g");
    let m;
    while ((m = re.exec(norm))) { const i = m.index + m[1].length; out = out.slice(0, i) + l + out.slice(i + m[2].length); }
  }
  return out;
}
function tituloLindo(t, extra = []){
  let s = String(t).trim().replace(/^(venta|alquiler)\s+(de\s+)?/i, "");
  if (s !== s.toUpperCase()) return s.charAt(0).toUpperCase() + s.slice(1);   // ya viene bien escrito
  s = capitalizarLugares(s.toLowerCase(), extra);
  s = s.replace(/\b(country|club|barrio cerrado)\b/g, m => m.replace(/\b\w/g, c => c.toUpperCase()));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- Interpretar el texto de una propiedad ---------- */
function interpretarTxt(texto, carpeta){
  const p = {}, desc = [], caracteristicas = [];
  let seccion = "datos", primera = true;
  const cuerpo = texto.split(/\r?\n-{8,}/)[0];            // se ignoran las instrucciones de la plantilla
  for (const lineaRaw of cuerpo.split(/\r?\n/)) {
    const linea = lineaRaw.trim();
    if (!linea) { if (seccion === "descripcion") desc.push(""); continue; }
    // Encabezados de sección en mayúsculas (formato teamnexia)
    const enc = sinTildes(linea);
    if (/^descripcion:?$/.test(enc)) { seccion = "descripcion"; continue; }
    if (/^caracteristicas:?$/.test(enc)) { seccion = "caracteristicas"; continue; }
    if (/^(direccion|ubicacion):?$/.test(enc)) { seccion = "datos"; continue; }
    if (seccion === "descripcion") { desc.push(lineaRaw.trimEnd()); continue; }
    if (seccion === "caracteristicas" && /^[-•*]\s*/.test(linea)) { caracteristicas.push(linea.replace(/^[-•*]\s*/, "")); continue; }
    if (/^https?:\/\//.test(linea)) { primera = false; continue; }     // link de la publicación original
    const m = linea.match(/^([^:]{2,30}):\s*(.*)$/);
    const campo = m && CLAVE[sinTildes(m[1])];
    if (campo === "descripcion") { seccion = "descripcion"; if (m[2].trim()) desc.push(m[2].trim()); continue; }
    if (campo) { if (p[campo] == null || p[campo] === "") p[campo] = m[2].trim(); primera = false; continue; }
    if (primera && !m) { p.titulo = p.titulo || linea; primera = false; continue; }   // 1.ª línea = título
    if (!m) desc.push(lineaRaw.trimEnd());                // texto suelto: va a la descripción
  }
  p.descripcion = desc.join("\n").replace(/^\s+|\s+$/g, "").replace(/\n{3,}/g, "\n\n");

  const todo = sinTildes(texto + " " + carpeta);
  const out = { estado: "nueva", publicada: false, moneda: "USD", fotos: [], amenities: [] };
  out.operacion = /alquiler/.test(sinTildes(p.estado || "") + " " + sinTildes(p.titulo || carpeta)) ? "alquiler" : "venta";
  out.tipo = (TIPOS_TXT.find(([re]) => re.test(sinTildes(p.tipo || ""))) || TIPOS_TXT.find(([re]) => re.test(todo)) || [, "Departamento"])[1];

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
  out.m2 = Math.round(n("m2", /(\d+[.,]?\d*)\s*(m2|m²|mts)/) || 0);
  out.m2cub = Math.round(numero(p.m2cub) || out.m2);
  if (out.m2cub > out.m2) out.m2 = out.m2cub;
  out.antiguedad = p.antiguedad != null ? (/estrenar/.test(sinTildes(p.antiguedad)) ? 0 : numero(p.antiguedad) || 0) : 0;
  out.cochera = p.cochera != null ? siNo(p.cochera) : /\bcochera\b/.test(todo) && !/sin cochera/.test(todo);
  out.aptoCredito = p.aptoCredito != null ? siNo(p.aptoCredito) : /apt[oa]\s*(para\s*)?credito/.test(todo);
  out.disposicion = ["Frente","Contrafrente","Lateral","Interno"].find(d => sinTildes(d) === sinTildes(p.disposicion || "")) || "";
  out.direccion = p.direccion || "";
  out.ciudad = p.ciudad || "";
  // Características: las de la lista (sin servicios básicos) o las de "Destacados:"
  const lista = caracteristicas.length ? caracteristicas : String(p.amenities || "").split(/[,;]/);
  out.amenities = lista.map(s => s.trim().replace(/^ápto/i, "Apto")).filter(s => s && !BASICOS.test(sinTildes(s))).slice(0, 16);
  out.etiqueta = p.etiqueta || "";
  out.video = /^https?:\/\//.test(p.video || "") ? p.video.trim() : null;
  out.tour360 = /^https?:\/\//.test(p.tour360 || "") ? p.tour360.trim() : null;
  if (p.codigo) out.codigo = p.codigo.trim();
  if (p.lat) out.lat = numero(p.lat); if (p.lng) out.lng = numero(p.lng);
  if (p.estado) out.estado = (ESTADOS_TXT.find(([re]) => re.test(sinTildes(p.estado))) || [, "nueva"])[1];
  out.descripcion = p.descripcion;

  // Ubicación: lo que diga el texto o, si no, un barrio conocido que aparezca en el título o la carpeta
  out.barrio = p.barrio || "";
  out.zona = p.zona ? zonaDesde(p.zona) || p.zona : "";
  if (!out.barrio) {
    const conocidos = ZONAS.flatMap(z => UBICACIONES[z].map(b => [b, z])).sort((a, b) => b[0].length - a[0].length);
    const hit = conocidos.find(([b]) => new RegExp(`\\b${reEsc(sinTildes(b))}\\b`).test(todo));
    if (hit) { out.barrio = hit[0]; out.zona = out.zona || hit[1]; }
  } else {
    // Normaliza la escritura del barrio si es uno conocido ("Monserrat" → "Montserrat" no, pero "palermo" → "Palermo")
    const igual = LUGARES.find(l => sinTildes(l) === sinTildes(out.barrio));
    if (igual) out.barrio = igual;
  }
  if (!out.zona) out.zona = zonaDe(out);
  if (out.zona === "Capital Federal" && !out.ciudad) out.ciudad = "CABA";
  if (/capital federal/i.test(out.ciudad)) out.ciudad = "CABA";
  // Título: sin "VENTA", en minúscula y con los nombres de lugares bien escritos
  out.titulo = tituloLindo(p.titulo || carpeta.replace(/^\[[^\]]*\]\s*/, "").replace(/^\d+\s*-\s*/, ""), [out.barrio, out.ciudad]);

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

/* ---------- Agrupar archivos por propiedad ---------- */
function carpetaDe(path){
  const dirs = path.split("/").slice(0, -1);
  while (dirs.length > 1 && SUBCARPETA.test(dirs[dirs.length - 1])) dirs.pop();   // fotos/, video/… pertenecen a la propiedad
  return dirs.join("/");
}
async function analizarCarpeta(files){
  const grupos = new Map();
  for (const f of files) {
    const path = f.webkitRelativePath || f.name;
    const partes = path.split("/");
    if (partes.some(x => x.startsWith(".") || x === "__MACOSX")) continue;    // archivos ocultos
    const carpeta = carpetaDe(path) || "(sin carpeta)";
    if (!grupos.has(carpeta)) grupos.set(carpeta, { carpeta, nombre: carpeta.split("/").pop(), fotos: [], videos: [], txt: [], urls: [] });
    const g = grupos.get(carpeta);
    if (IMG_EXT.test(f.name)) g.fotos.push(f);
    else if (VID_EXT.test(f.name)) g.videos.push(f);
    else if (/\.txt$/i.test(f.name)) g.txt.push(f);
    else if (/\.url$/i.test(f.name)) g.urls.push(f);
  }
  const lista = [];
  for (const g of grupos.values()) {
    if (!g.fotos.length && !g.txt.length) continue;     // carpeta sin nada útil (por ejemplo la raíz)
    // Orden de lectura: info.txt (links), descripcion/ficha (datos y texto). ESTADO.txt marca que ya no está publicada.
    const estadoTxt = g.txt.find(f => /^estado\.txt$/i.test(f.name));
    const ordenados = g.txt.filter(f => f !== estadoTxt).sort((a, b) => (/^info/i.test(b.name) - /^info/i.test(a.name)));
    let texto = "";
    for (const f of ordenados) texto += (await leerTexto(f)) + "\n";
    // Accesos directos .url (ej: "Tour virtual.url") → link del tour si no estaba en el texto
    for (const u of g.urls) {
      const url = ((await leerTexto(u)).match(/^URL=(.+)$/m) || [])[1];
      if (url && !/tour virtual:\s*http/i.test(texto)) texto = `Tour virtual: ${url.trim()}\n` + texto;
    }
    const p = interpretarTxt(texto, g.nombre);
    g.fotos.sort((a, b) => (/portada|principal|cover/i.test(b.name) - /portada|principal|cover/i.test(a.name)) || a.name.localeCompare(b.name, "es", { numeric: true }));
    const video = p.video ? null : (g.videos[0] || null);   // si ya hay link de YouTube, no se sube el archivo
    const avisos = [], bloqueos = [];
    if (estadoTxt || /^\[no publicada\]/i.test(g.nombre)) bloqueos.push("Marcada como no publicada (vendida, alquilada o quitada)");
    if (!p.precio) bloqueos.push("Falta el precio");
    if (!g.fotos.length) bloqueos.push("No tiene fotos");
    if (!ordenados.length) avisos.push("No tiene .txt: se usa el nombre de la carpeta como título");
    if (!p.barrio) avisos.push("No se detectó el barrio");
    if (video && !Videos.entra(video)) avisos.push(`El video pesa ${(video.size / 1048576).toFixed(0)} MB (máx. ${Videos.MAX_MB}): subilo a YouTube y agregá "Video: link"`);
    if (p.codigo && TODAS.some(x => x.codigo === p.codigo)) avisos.push(`Ya existe ${p.codigo}: se va a actualizar con estos datos`);
    lista.push({ ...g, p, video, avisos: [...bloqueos, ...avisos], incluir: !bloqueos.length, bloqueada: bloqueos.length > 0, estadoImp: "" });
  }
  return lista.sort((a, b) => (b.incluir - a.incluir) || a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
}

/* ---------- Pantalla ---------- */
const maxFotos = () => +($('#imp-maxfotos')?.value || 0) || Infinity;
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
    const datos = [p.operacion === "alquiler" ? "Alquiler" : "Venta", p.tipo, amb, p.m2 ? `${p.m2} m²` : "", p.barrio].filter(Boolean).join(" · ");
    const nf = Math.min(x.fotos.length, maxFotos());
    const extras = [p.video ? "video" : x.video && Videos.entra(x.video) ? "video (archivo)" : "", p.tour360 ? "tour 360°" : ""].filter(Boolean);
    return `<article class="imp-item ${x.incluir ? "" : "off"}">
      <label class="imp-chk"><input type="checkbox" data-imp="${i}" ${x.incluir ? "checked" : ""} ${importando ? "disabled" : ""} aria-label="Importar ${esc(p.titulo)}"></label>
      <div class="imp-th">${thumb ? `<img src="${thumb}" alt="">` : ""}</div>
      <div class="imp-info">
        <b>${esc(p.titulo)}</b>
        <span>${esc(datos) || "Sin datos"}</span>
        <span>${p.precio ? `${p.tipo === "Desarrollo en pozo" ? "Desde " : ""}${p.moneda} ${fmt(p.precio)}` : "<em>Sin precio</em>"} · ${nf} ${nf === 1 ? "foto" : "fotos"}${extras.length ? " · " + extras.join(" · ") : ""}${p.codigo ? ` · ${esc(p.codigo)}` : ""}</span>
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
$('#imp-maxfotos').onchange = renderImport;
// Lee los archivos elegidos o arrastrados. Con "sumar", agrega a la lista las carpetas que no estaban.
async function cargarArchivos(files, sumar = false){
  if (!files.length || importando) return;
  $('#imp-cargando').hidden = false;
  let nuevas = [];
  try { nuevas = await analizarCarpeta(files); }
  catch (err){ console.error(err); toast("No se pudo leer la carpeta: " + err.message); }
  finally { $('#imp-cargando').hidden = true; }
  if (sumar && IMPORT.length) {
    const ya = new Set(IMPORT.map(x => x.carpeta || x.nombre));
    const extra = nuevas.filter(x => !ya.has(x.carpeta || x.nombre));
    IMPORT = IMPORT.concat(extra);
    toast(extra.length ? `Sumé ${extra.length} ${extra.length === 1 ? "carpeta" : "carpetas"}` : "Esas carpetas ya estaban en la lista");
  } else {
    IMPORT = nuevas;
    if (!IMPORT.length) toast("No encontré propiedades: cada una tiene que estar en su carpeta, con fotos o un .txt");
  }
  renderImport();
}
$('#imp-dir').onchange = e=>{ const files = [...e.target.files]; e.target.value = ""; cargarArchivos(files); };

// Arrastrar carpetas: se recorren con webkitGetAsEntry y cada archivo lleva su ruta (como al elegir carpeta)
async function archivosDeEntradas(entradas){
  const files = [];
  const leer = (e, base) => new Promise(async (ok, mal) => {
    try {
      if (e.isFile) {
        const f = await new Promise((r, m) => e.file(r, m));
        Object.defineProperty(f, "webkitRelativePath", { value: base + f.name });
        files.push(f);
      } else if (e.isDirectory) {
        const lector = e.createReader();
        for (;;) {
          const lote = await new Promise((r, m) => lector.readEntries(r, m));
          if (!lote.length) break;
          for (const h of lote) await leer(h, base + e.name + "/");
        }
      }
      ok();
    } catch (err) { mal(err); }
  });
  for (const e of entradas) await leer(e, "");
  return files;
}
const IMP = $('#imp');
let arrastres = 0;
const conArchivos = e => [...(e.dataTransfer?.types || [])].includes("Files");
IMP.addEventListener('dragenter', e => { if (!conArchivos(e)) return; e.preventDefault(); arrastres++; IMP.classList.add('arrastrando'); });
IMP.addEventListener('dragover', e => { if (!conArchivos(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
IMP.addEventListener('dragleave', () => { if (--arrastres <= 0) { arrastres = 0; IMP.classList.remove('arrastrando'); } });
IMP.addEventListener('drop', async e => {
  if (!conArchivos(e)) return;
  e.preventDefault(); arrastres = 0; IMP.classList.remove('arrastrando');
  if (importando) { toast("Esperá a que termine la importación"); return; }
  // Las entradas hay que tomarlas ya, antes de cualquier await
  const entradas = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  const sumar = IMPORT.length > 0;
  try {
    const files = entradas.length ? await archivosDeEntradas(entradas) : [...e.dataTransfer.files];
    await cargarArchivos(files, sumar);
  } catch (err) { console.error(err); toast("No pude leer lo que arrastraste: " + err.message); }
});
// Que soltar fuera de la zona no abra la foto en el navegador
window.addEventListener('dragover', e => { if (IMP.classList.contains('open')) e.preventDefault(); });
window.addEventListener('drop', e => { if (IMP.classList.contains('open')) e.preventDefault(); });

$('#imp-todas').onclick = ()=>{ if (importando) return; IMPORT.forEach(x => { if (!x.bloqueada && !String(x.estadoImp).startsWith("✓")) x.incluir = true; }); renderImport(); };
$('#imp-ninguna').onclick = ()=>{ if (importando) return; IMPORT.forEach(x => x.incluir = false); renderImport(); };
$('#imp-list').onchange = e=>{ const c = e.target.closest('[data-imp]'); if (c){ IMPORT[+c.dataset.imp].incluir = c.checked; renderImport(); } };

/* ---------- Importar ---------- */
const PROP_A_LA_VEZ = 3, FOTOS_A_LA_VEZ = 4;
// Corre fn sobre cada elemento, con hasta n a la vez
async function enParalelo(lista, n, fn){
  let sig = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (sig < lista.length) await fn(lista[sig++]); }));
}
// Redibuja la lista como mucho una vez por cuadro (con varias subidas a la vez se llama muy seguido)
let pintando = false;
function pintar(){ if (pintando) return; pintando = true; requestAnimationFrame(() => { pintando = false; renderImport(); }); }
$('#imp-go').onclick = async ()=>{
  const items = IMPORT.filter(x => x.incluir);
  if (!items.length || importando) return;
  const publicar = $('#imp-publicar').checked, tope = maxFotos();
  importando = true; renderImport();
  // Códigos nuevos correlativos (NX-121, NX-122…) para las que no traen código
  let ultimo = Math.max(100, ...TODAS.map(p => parseInt(String(p.codigo).replace(/\D/g, ""), 10) || 0).filter(n => n < 100000));
  let ok = 0;
  // Se suben varias propiedades al mismo tiempo (PROP_A_LA_VEZ) y en cada una varias fotos en paralelo (FOTOS_A_LA_VEZ)
  for (const x of items) if (!x.p.codigo) x.p.codigo = "NX-" + String(++ultimo).padStart(3, "0");
  await enParalelo(items, PROP_A_LA_VEZ, async x => {
    try {
      const datos = { ...x.p };
      const p = { ...datos, publicada: publicar, publicado: new Date().toISOString().slice(0, 10) };
      const fotos = x.fotos.slice(0, tope), subidas = new Array(fotos.length).fill(null);
      let listas = 0;
      x.estadoImp = `Subiendo fotos 0 de ${fotos.length}…`; pintar();
      await enParalelo(fotos.map((f, i) => i), FOTOS_A_LA_VEZ, async i => {
        try { subidas[i] = await Fotos.subir(fotos[i], "propiedades", { max: 1600 }); }
        catch (err) { console.error(err); x.avisos.push(`No se pudo subir ${fotos[i].name}`); }
        x.estadoImp = `Subiendo fotos ${++listas} de ${fotos.length}…`; pintar();
      });
      p.fotos = subidas.filter(Boolean);           // mismo orden que en la carpeta
      if (x.video && Videos.entra(x.video) && !p.video) {
        x.estadoImp = `Subiendo video (${(x.video.size / 1048576).toFixed(0)} MB)…`; pintar();
        try { p.video = await Videos.subir(x.video); }
        catch (err) { console.error(err); x.avisos.push("No se pudo subir el video: " + err.message); }
      }
      x.estadoImp = "Guardando…"; pintar();
      await Store.upsert(p);
      x.estadoImp = `✓ Importada como ${p.codigo}${publicar ? "" : " (oculta, para revisar)"}`; ok++;
    } catch (err) {
      console.error(err); x.estadoImp = "✕ " + err.message;
    }
    x.incluir = false; pintar();
  });
  importando = false; renderImport();
  $('#imp-go').textContent = "Listo"; $('#imp-go').disabled = true;
  await recargar();
  toast(`${ok} ${ok === 1 ? "propiedad importada" : "propiedades importadas"}`);
};
