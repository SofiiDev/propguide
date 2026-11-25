// Vista previa al compartir (WhatsApp, Facebook, Instagram, etc.)
// Cuando alguien comparte un link con ?p=CÓDIGO, este código agrega a la página la foto,
// el tipo, el barrio y el precio de esa propiedad, para que el mensaje muestre la foto.
// Sin ?p= deja el título general y le agrega una imagen (el header de Nexia).

// Datos públicos de Supabase (los mismos de public/config.js: la clave "publishable" es pública).
const SUPABASE_URL = "https://gpxxnookggyopjmyrxaq.supabase.co";
const SUPABASE_KEY = "sb_publishable_mNCNCTQMnWseH-ad4wmO2A_Orv9CcGl";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = n => new Intl.NumberFormat("es-AR").format(n || 0);

export function textoPrecio(p) {
  const mon = p.moneda === "ARS" ? "$" : (p.moneda || "USD");
  return `${p.tipo === "Desarrollo en pozo" ? "Desde " : ""}${mon} ${fmt(p.precio)}${p.operacion === "alquiler" ? " /mes" : ""}`;
}
export function textoTipo(p) {
  const tipo = p.tipo === "Desarrollo en pozo" ? "Desarrollo" : (p.tipo || "Propiedad");
  const amb = p.ambientes === 1 ? "Monoambiente" : p.ambientes ? `${p.ambientes} ambientes` : "";
  return [tipo, amb, p.barrio].filter(Boolean).join(" · ");
}
// Título en minúscula normal si vino todo en MAYÚSCULAS
function lindo(s) {
  s = String(s || "").trim();
  const letras = s.match(/\p{L}/gu) || [];
  const mayus = letras.filter(c => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  if (letras.length && mayus / letras.length > .7) s = s.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Reemplaza las etiquetas de vista previa del <head>
export function inyectar(html, meta) {
  const etiquetas = [
    `<title>${esc(meta.titulo)}</title>`,
    `<meta name="description" content="${esc(meta.descripcion)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(meta.sitio)}">`,
    `<meta property="og:title" content="${esc(meta.titulo)}">`,
    `<meta property="og:description" content="${esc(meta.descripcion)}">`,
    meta.url && `<meta property="og:url" content="${esc(meta.url)}">`,
    meta.imagen && `<meta property="og:image" content="${esc(meta.imagen)}">`,
    meta.imagen && `<meta property="og:image:alt" content="${esc(meta.titulo)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join("\n");
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(name="description"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*/gi, "")
    .replace(/<\/head>/i, `${etiquetas}\n</head>`);
}

export function metaDe(p, url) {
  return {
    titulo: `${textoTipo(p)} · ${textoPrecio(p)}`,
    descripcion: lindo(p.titulo) || "Mirá fotos, tours en video y agendá tu visita por WhatsApp.",
    imagen: p.fotos?.[0] || `${url.origin}/header-nexia.jpg`,
    url: `${url.origin}${url.pathname}?p=${encodeURIComponent(p.codigo)}`,
    sitio: "Nexia Team Inmobiliario",
  };
}

export default async (request, context) => {
  const url = new URL(request.url);
  const respuesta = await context.next();
  if (!(respuesta.headers.get("content-type") || "").includes("text/html")) return respuesta;

  const codigo = url.searchParams.get("p");
  let meta = null;
  if (codigo && /^[\w-]{2,40}$/.test(codigo)) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/propiedades?select=codigo,data&publicada=eq.true&codigo=eq.${encodeURIComponent(codigo)}&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      const fila = r.ok ? (await r.json())[0] : null;
      if (fila) meta = metaDe({ ...fila.data, codigo: fila.codigo }, url);
    } catch { /* si Supabase no responde, se usa la vista previa general */ }
  }
  if (!meta) {
    const alq = /^\/alquiler/i.test(url.pathname);
    meta = {
      titulo: alq ? "Propiedades en alquiler" : "Propiedades en venta",
      descripcion: "Mirá fotos, tours en video y agendá tu visita por WhatsApp.",
      imagen: `${url.origin}/header-nexia.jpg`, url: `${url.origin}${url.pathname}`, sitio: "Nexia Team Inmobiliario",
    };
  }
  const headers = new Headers(respuesta.headers);
  headers.delete("content-length");
  return new Response(inyectar(await respuesta.text(), meta), { status: respuesta.status, headers });
};

export const config = { path: ["/", "/alquiler", "/venta"] };
