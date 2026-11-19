/* =========================================================
   STORE — capa de datos compartida entre la galería (index.html)
   y el panel (admin.html).

   · Con config.js completo → todo se guarda en Supabase:
       tabla `propiedades`, tabla `config` y bucket de fotos `fotos`.
   · Sin config.js completo → MODO DEMO: propiedades de ejemplo
     (data.js) guardadas en el navegador. Sirve para probar.

   Todas las funciones son async (devuelven promesas).
   ========================================================= */
const CFG_APP = window.APP_CONFIG || {};
const MODO_DEMO = !CFG_APP.SUPABASE_URL || /TU-PROYECTO/.test(CFG_APP.SUPABASE_URL) ||
                  !CFG_APP.SUPABASE_ANON_KEY || /TU_ANON_KEY/.test(CFG_APP.SUPABASE_ANON_KEY);
const sb = !MODO_DEMO && window.supabase
  ? window.supabase.createClient(CFG_APP.SUPABASE_URL, CFG_APP.SUPABASE_ANON_KEY)
  : null;

// Helpers del modo demo (localStorage, con try/catch por navegadores en modo privado)
const demo = {
  get(k, def){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const fallo = error => { if (error) throw new Error(error.message || "Error de Supabase"); };

/* ---------------- Propiedades ---------------- */
const Store = {
  DEMO_KEY: "propiedades_demo_v1",

  // Admin: todas (incluidas las ocultas). Público: solo las publicadas (RLS lo garantiza igual).
  async all({ soloPublicadas = false } = {}) {
    if (MODO_DEMO) {
      const list = demo.get(this.DEMO_KEY, null) || (typeof SEED !== "undefined" ? SEED : []).map(p => ({ publicada: true, ...p }));
      return soloPublicadas ? list.filter(p => p.publicada !== false) : list;
    }
    let q = sb.from("propiedades").select("codigo, publicada, orden, data, updated_at")
      .order("orden", { ascending: true }).order("updated_at", { ascending: false });
    if (soloPublicadas) q = q.eq("publicada", true);
    const { data, error } = await q; fallo(error);
    return data.map(r => ({ ...r.data, codigo: r.codigo, publicada: r.publicada }));
  },
  publicas() { return this.all({ soloPublicadas: true }); },

  async upsert(p) {
    if (MODO_DEMO) {
      const list = await this.all(); const i = list.findIndex(x => x.codigo === p.codigo);
      if (i >= 0) list[i] = p; else list.unshift(p);
      if (!demo.set(this.DEMO_KEY, list)) throw new Error("No hay espacio en el navegador");
      return;
    }
    const { codigo, publicada, ...data } = p;
    const { error } = await sb.from("propiedades").upsert({
      codigo, publicada: publicada !== false, data, updated_at: new Date().toISOString(),
    });
    fallo(error);
  },

  async remove(codigo) {
    if (MODO_DEMO) { demo.set(this.DEMO_KEY, (await this.all()).filter(p => p.codigo !== codigo)); return; }
    const { error } = await sb.from("propiedades").delete().eq("codigo", codigo); fallo(error);
  },

  async nextCodigo() {
    const n = (await this.all()).map(p => parseInt(String(p.codigo).replace(/\D/g, ""), 10) || 0);
    return "NX-" + String(Math.max(100, ...n) + 1).padStart(3, "0");
  },

  // Carga las propiedades de ejemplo de data.js (para arrancar con algo)
  async cargarEjemplos() {
    for (const p of (typeof SEED !== "undefined" ? SEED : [])) await this.upsert({ publicada: true, ...p });
  },
};

/* ---------------- Fotos (Supabase Storage) ---------------- */
const Fotos = {
  // Achica la imagen en el navegador antes de subirla (carga rápida en celulares)
  async preparar(file, { max = 1600, cuadrada = false, calidad = 0.8 } = {}) {
    const img = await createImageBitmap(file);
    const c = document.createElement("canvas");
    if (cuadrada) {
      const s = Math.min(img.width, img.height), out = Math.min(max, s);
      c.width = c.height = out;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, out, out);
    } else {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    }
    return new Promise(res => c.toBlob(res, "image/jpeg", calidad));
  },

  // Devuelve la URL pública de la foto subida
  async subir(file, carpeta = "propiedades", opciones) {
    const blob = await this.preparar(file, opciones);
    if (MODO_DEMO) {
      return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    }
    const path = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    fallo(error);
    return sb.storage.from("fotos").getPublicUrl(path).data.publicUrl;
  },
};

/* ---------------- Sesión del administrador ---------------- */
const Auth = {
  async usuario() {
    if (MODO_DEMO) return demo.get("demo_admin", null);
    const { data } = await sb.auth.getSession();
    return data.session?.user || null;
  },
  async entrar(email, password) {
    if (MODO_DEMO) { const u = { email }; demo.set("demo_admin", u); return u; }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid/i.test(error.message) ? "Email o contraseña incorrectos" : error.message);
    return data.user;
  },
  async salir() {
    if (MODO_DEMO) { try { localStorage.removeItem("demo_admin"); } catch {} return; }
    await sb.auth.signOut();
  },
  async recuperar(email) {
    if (MODO_DEMO) return;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    fallo(error);
  },
  async cambiarPassword(password) {
    if (MODO_DEMO) return;
    const { error } = await sb.auth.updateUser({ password }); fallo(error);
  },
  // ¿El usuario logueado está en la tabla admins?
  async esAdmin() {
    if (MODO_DEMO) return true;
    const { data, error } = await sb.rpc("es_admin");
    return !error && data === true;
  },
  alCambiar(fn) { if (sb) sb.auth.onAuthStateChange((evento, sesion) => fn(evento, sesion)); },
};

/* ---------------- Suscriptores (pop-up de novedades) ---------------- */
const Suscriptores = {
  DEMO_KEY: "suscriptores_demo_v1",
  // Público: solo puede agregar. Si el email ya estaba, cuenta como éxito.
  async agregar({ email, interes = "", zona = "", origen = "" }) {
    const fila = { email: email.trim().toLowerCase(), interes, zona, origen };
    if (MODO_DEMO) {
      const list = demo.get(this.DEMO_KEY, []);
      if (!list.some(x => x.email === fila.email)) list.unshift({ id: Date.now(), created_at: new Date().toISOString(), ...fila });
      demo.set(this.DEMO_KEY, list); return;
    }
    const { error } = await sb.from("suscriptores").insert(fila);
    if (error && error.code !== "23505") fallo(error);   // 23505 = ya estaba suscripto
  },
  // Admin
  async listar() {
    if (MODO_DEMO) return demo.get(this.DEMO_KEY, []);
    const { data, error } = await sb.from("suscriptores").select("id, email, interes, zona, origen, created_at")
      .order("created_at", { ascending: false });
    fallo(error); return data;
  },
  async borrar(id) {
    if (MODO_DEMO) { demo.set(this.DEMO_KEY, demo.get(this.DEMO_KEY, []).filter(x => x.id !== id)); return; }
    const { error } = await sb.from("suscriptores").delete().eq("id", id); fallo(error);
  },
};

/* =========================================================
   CONFIG — tu perfil y los textos de la galería (se editan en el panel)
   ========================================================= */
const Config = {
  DEMO_KEY: "galeria_config_demo_v1",
  DEFAULTS: {
    nombre: "Tu Nombre",
    rol: "Corredor/a inmobiliario/a · Mat. 0000",
    foto: "",                       // vacío = se muestran tus iniciales
    whatsapp: "5491100000000",      // 549 + código de área + número, sin 0 ni 15
    titulo: "Propiedades en venta",
    subtitulo: "Fotos, tour en video y visitas por WhatsApp",
    ayudaTitulo: "¿No encontraste lo que buscabas?",
    ayudaTituloFicha: "¿Querés ver más opciones? Hablemos.",
    ayudaTexto: "Te ofrezco un servicio de búsqueda integral en el interior de Buenos Aires, con acceso a propiedades que todavía no salieron al mercado.",
    ayudaPuntos: [
      "Búsqueda personalizada, que incluye propiedades no publicadas y desarrollos en pozo",
      "Selección previa de opciones y coordinación de visitas",
      "Asesoramiento en la oferta, la negociación y la escritura",
    ],
    ayudaBoton: "Escribime por WhatsApp",
    // Cuando un filtro no trae resultados. {zona} se reemplaza por la zona o barrio elegido.
    ayudaTituloVacio: "¿No encontraste lo que buscabas?",
    ayudaTextoVacio: "Te ofrezco un servicio de búsqueda integral en {zona}, con acceso a propiedades que todavía no salieron al mercado.",
    // Pop-up para dejar el email
    popupActivo: true,
    popupSegundos: 20,
    popupTitulo: "Enterate antes que nadie",
    popupTexto: "Te aviso por email cuando entren propiedades nuevas, desarrollos en pozo y oportunidades.",
    popupBoton: "Quiero recibir novedades",
    // Texto legal obligatorio: va al final de cada ficha y al pie de la galería
    legalTexto: "En cumplimiento de la leyes provinciales vigentes que regulan el corretaje inmobiliario, Ley Nacional 25.028, Ley 22.802 de Lealtad Comercial, Ley 24.240 de Defensa al Consumidor, las normas del Código Civil y Comercial de la Nación y Constitucionales, los agentes NO ejercen el corretaje inmobiliario. Todas las operaciones inmobiliarias son objeto de intermediación y conclusión por parte del corredor colegiado, cuyos datos se exhiben en esta pieza.",
    legalCorredores: "Fabio Reyes / CUCICBA: 7441\nAguilar Paula Micaela /37010 CMCPD - Tomo III F.715",
  },
  async get() {
    if (MODO_DEMO) return { ...this.DEFAULTS, ...demo.get(this.DEMO_KEY, {}) };
    const { data, error } = await sb.from("config").select("data").eq("id", 1).maybeSingle(); fallo(error);
    return { ...this.DEFAULTS, ...(data?.data || {}) };
  },
  async save(cfg) {
    if (MODO_DEMO) { if (!demo.set(this.DEMO_KEY, cfg)) throw new Error("No hay espacio en el navegador"); return; }
    const { error } = await sb.from("config").upsert({ id: 1, data: cfg, updated_at: new Date().toISOString() });
    fallo(error);
  },
  iniciales(nombre) {
    return (nombre || "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  },
};

/* =========================================================
   UBICACIONES — como las agrupan los portales en Argentina:
   Capital Federal, GBA (Norte / Oeste / Sur), Buenos Aires Costa e Interior,
   y el resto de las provincias. Cada una con sus barrios o localidades.
   Lo usan el filtro de la galería y el campo "Provincia o zona" del panel.
   ========================================================= */
const UBICACIONES = {
  "Capital Federal": ["Agronomía","Almagro","Balvanera","Barracas","Barrio Norte","Belgrano","Boedo","Caballito","Chacarita","Coghlan","Colegiales","Constitución","Flores","Floresta","La Boca","La Paternal","Liniers","Mataderos","Monte Castro","Montserrat","Nueva Pompeya","Núñez","Palermo","Parque Avellaneda","Parque Chacabuco","Parque Chas","Parque Patricios","Puerto Madero","Recoleta","Retiro","Saavedra","San Cristóbal","San Nicolás","San Telmo","Vélez Sarsfield","Versalles","Villa Crespo","Villa del Parque","Villa Devoto","Villa General Mitre","Villa Lugano","Villa Luro","Villa Ortúzar","Villa Pueyrredón","Villa Real","Villa Riachuelo","Villa Santa Rita","Villa Soldati","Villa Urquiza"],
  "GBA Norte": ["Acassuso","Beccar","Benavídez","Boulogne","Del Viso","Escobar","Florida","La Lucila","Martínez","Munro","Nordelta","Olivos","Pilar","San Fernando","San Isidro","Tigre","Vicente López","Victoria","Villa Adelina"],
  "GBA Oeste": ["Castelar","Caseros","Haedo","Hurlingham","Ituzaingó","Merlo","Moreno","Morón","Ramos Mejía","San Justo","Villa Bosch"],
  "GBA Sur": ["Adrogué","Avellaneda","Banfield","Berazategui","Bernal","Canning","Ezeiza","Lanús","Lomas de Zamora","Quilmes","Temperley"],
  "Buenos Aires Costa Atlántica": ["Cariló","Mar de las Pampas","Mar del Plata","Miramar","Necochea","Pinamar","Villa Gesell"],
  "Buenos Aires Interior": ["Bahía Blanca","Junín","La Plata","Luján","Pergamino","San Nicolás de los Arroyos","Tandil"],
  "Catamarca": ["San Fernando del Valle de Catamarca"],
  "Chaco": ["Resistencia"],
  "Chubut": ["Comodoro Rivadavia","Puerto Madryn","Trelew"],
  "Córdoba": ["Alta Gracia","Córdoba Capital","Mendiolaza","Río Cuarto","Villa Allende","Villa Carlos Paz","Villa General Belgrano"],
  "Corrientes": ["Corrientes Capital"],
  "Entre Ríos": ["Concordia","Gualeguaychú","Paraná"],
  "Formosa": ["Formosa Capital"],
  "Jujuy": ["San Salvador de Jujuy"],
  "La Pampa": ["Santa Rosa"],
  "La Rioja": ["La Rioja Capital"],
  "Mendoza": ["Chacras de Coria","Godoy Cruz","Luján de Cuyo","Mendoza Capital","San Rafael"],
  "Misiones": ["Oberá","Posadas","Puerto Iguazú"],
  "Neuquén": ["Neuquén Capital","San Martín de los Andes","Villa La Angostura"],
  "Río Negro": ["Cipolletti","San Carlos de Bariloche","Viedma"],
  "Salta": ["Salta Capital"],
  "San Juan": ["San Juan Capital"],
  "San Luis": ["Merlo (San Luis)","San Luis Capital"],
  "Santa Cruz": ["El Calafate","Río Gallegos"],
  "Santa Fe": ["Funes","Rafaela","Rosario","Santa Fe Capital"],
  "Santiago del Estero": ["Santiago del Estero Capital"],
  "Tierra del Fuego": ["Ushuaia"],
  "Tucumán": ["San Miguel de Tucumán","Yerba Buena"],
};
const ZONAS = Object.keys(UBICACIONES);
// Zona de una propiedad: la que se cargó en el panel o, si no, se deduce por el barrio
function zonaDe(p) {
  if (p.zona) return p.zona;
  for (const z of ZONAS) if (UBICACIONES[z].includes(p.barrio)) return z;
  if (/caba|capital federal/i.test(p.ciudad || "")) return "Capital Federal";
  return "";
}
