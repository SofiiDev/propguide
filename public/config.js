/* =========================================================
   CONEXIÓN CON SUPABASE
   Los dos datos están en Supabase → Project Settings → API:
     · Project URL          → SUPABASE_URL
     · anon / public key    → SUPABASE_ANON_KEY
   La "anon key" es pública por diseño: lo que protege tus datos son los
   permisos (RLS) de supabase/schema.sql. NUNCA pongas acá la "service_role".

   Mientras estos valores sigan sin completar, el sitio funciona en
   MODO DEMO: usa propiedades de ejemplo y guarda todo en este navegador.
   ========================================================= */
window.APP_CONFIG = {
  SUPABASE_URL: "https://gpxxnookggyopjmyrxaq.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_mNCNCTQMnWseH-ad4wmO2A_Orv9CcGl",
};
