# PropGuide · Galería de propiedades

Galería mobile de propiedades en venta para el botón de tu Linktree, con panel de control
para administrarla. Hosting en **Netlify**, datos y fotos en **Supabase**.

- **Galería pública** (`/`): listado con filtros como los portales (tipo, ubicación en dos pasos,
  precio, ambientes, dormitorios, características), favoritos ♥, comparador de hasta 3 propiedades,
  ficha con fotos, tour en video, mapa, desarrollos en pozo, compartir y contacto por WhatsApp.
- **Panel de control** (`/admin`): ingreso con email y contraseña. Desde ahí editás **todo**:
  propiedades, fotos, estados (Nuevo ingreso / Reservada / Vendida), etiquetas, desarrollos en pozo,
  tu foto, nombre, WhatsApp y los textos de la galería.

## Estructura

```
public/            ← lo que publica Netlify
  index.html       galería
  admin.html       panel de control (pantalla)
  admin.js         panel de control (lógica)
  store.js         conexión con Supabase: propiedades, fotos, sesión, configuración, ubicaciones
  config.js        ⚠️ tu URL y anon key de Supabase
  data.js          propiedades de ejemplo (modo demo y botón “Cargar propiedades de ejemplo”)
supabase/
  schema.sql       tablas, permisos y bucket de fotos
netlify.toml       configuración de Netlify
```

No hay que instalar ni compilar nada: son archivos estáticos.

---

## Puesta en marcha (una sola vez, ~15 minutos)

### 1. Supabase: crear la base

1. Entrá a [supabase.com](https://supabase.com) → **New project**.
2. Abrí **SQL Editor → New query**, pegá todo `supabase/schema.sql`.
3. **Antes de ejecutar**, cambiá `TU_EMAIL@ejemplo.com` por tu email (el que vas a usar para entrar al panel).
4. Tocá **Run**. Esto crea las tablas `propiedades`, `config` y `admins`, los permisos y el bucket `fotos`.

### 2. Supabase: crear tu usuario administrador

1. **Authentication → Users → Add user → Create new user**.
2. Poné tu email (el mismo del paso anterior) y una contraseña. Marcá **Auto Confirm User**.
3. **Authentication → Sign In / Providers → Email**: desactivá **Allow new users to sign up**
   (así nadie más puede crearse una cuenta).
4. **Authentication → URL Configuration → Site URL**: poné la dirección de tu sitio en Netlify
   (por ejemplo `https://propguide.netlify.app`). Se usa para el email de “Olvidé mi contraseña”.
   En **Redirect URLs** agregá `https://propguide.netlify.app/admin.html`.

> ¿Querés sumar a otra persona como administradora? Creale el usuario y agregá su email:
> `insert into public.admins (email) values ('otra@persona.com');`

### 3. Conectar el sitio con Supabase

En Supabase → **Project Settings → API** copiá:

- **Project URL** → `SUPABASE_URL`
- **anon public** key → `SUPABASE_ANON_KEY`

y pegalos en `public/config.js`.

La anon key es pública por diseño (va en el navegador). Lo que protege tus datos son los permisos
de `schema.sql`: cualquiera puede **ver** lo publicado, pero solo un email de la tabla `admins`
puede **crear, editar o borrar**. **Nunca** pongas la `service_role` key en el sitio.

### 4. Publicar en Netlify

**Opción A, desde GitHub (recomendada):**
1. Subí este proyecto a tu repositorio.
2. En Netlify: **Add new site → Import an existing project → GitHub** → elegí el repositorio.
3. Netlify lee `netlify.toml` solo (carpeta `public`, sin comando de build). Tocá **Deploy**.
4. Cada vez que subas un cambio al repositorio, Netlify lo publica solo.

**Opción B, arrastrando:** en Netlify → **Add new site → Deploy manually** y arrastrá la carpeta `public`.

### 5. Primer ingreso

1. Entrá a `https://tu-sitio.netlify.app/admin`.
2. Ingresá con tu email y contraseña.
3. Tocá **Mi perfil y textos**: cargá tu foto, nombre, matrícula y **tu WhatsApp** (549 + área + número).
4. Cargá tus propiedades con **Nueva propiedad** (o probá con **Cargar propiedades de ejemplo** y después borralas).

### 6. Linktree

Agregá un botón, por ejemplo **“🏠 Propiedades en venta”**, con el link `https://tu-sitio.netlify.app`.

---

## Uso diario

| Quiero… | Dónde |
|---|---|
| Publicar una propiedad | Panel → **Nueva propiedad** |
| Marcar Reservada / Vendida / Nuevo ingreso | Panel → botones de estado de cada propiedad |
| Ocultarla sin borrarla | Panel → ícono del ojo |
| Poner “Oportunidad”, “Bajó de precio”… | Editor → Estado → Etiqueta extra |
| Cargar un desarrollo en pozo | Editor → Tipo: *Desarrollo en pozo* (aparecen entrega, avance, unidades y financiación) |
| Cambiar mi foto, WhatsApp o textos | Panel → **Mi perfil y textos** |
| Compartir una propiedad | Ficha → botón compartir (link con forma `?p=NX-102`) |

## Venta y alquiler

La misma galería tiene dos links, cada uno con sus propiedades y un selector para pasar al otro:

- **Venta:** `https://tu-sitio.netlify.app` (o `/venta`)
- **Alquiler:** `https://tu-sitio.netlify.app/alquiler`

En el panel, cada propiedad tiene **Operación: Venta / Alquiler** y la lista se separa en dos pestañas.
Los alquileres muestran el precio por mes, "Alquilada" en lugar de "Vendida" y un bloque de condiciones
(disponible desde, contrato, requisitos, mascotas, amueblado). El título de la página de alquiler se edita
en **Mi perfil y textos**. El importador trae los alquileres (los reconoce por "ALQUILER" en el nombre).

## Importar propiedades desde una carpeta

Para cargar muchas propiedades de una vez desde tu computadora.

**Una sola vez:** ejecutá `supabase/videos.sql` en el SQL Editor (crea el espacio para los videos).

1. Armá una carpeta por propiedad con sus fotos (`.jpg`, `.png`, `.webp`), su video (`.mp4`, hasta 50 MB) y un `ficha.txt`:
   ```
   Propiedades/
     Depto Palermo Gorriti/
       ficha.txt
       portada.jpg  foto2.jpg  foto3.jpg
       tour.mp4
   ```
2. Para el `ficha.txt` usá la plantilla (`public/plantilla-ficha.txt`, también se descarga desde el panel):
   cada dato como `Campo: valor` y después `Descripción:` con el texto libre.
3. En el panel tocá **Importar desde carpeta → Elegir carpeta** y elegí la carpeta `Propiedades`.
4. Revisá la vista previa: cada propiedad muestra lo que se detectó y los avisos (falta precio, video muy pesado…).
   Destildá las que no quieras importar.
5. Tocá **Importar**. Las fotos se achican y se suben, el video se sube y la propiedad se crea **oculta**
   para que la revises (o marcá *Publicar directamente*).

Videos de más de 50 MB: subilos a YouTube como *no listado* y agregá `Video: https://youtu.be/...` al `ficha.txt`.

## Modo demo

Mientras `config.js` tenga los valores de ejemplo, el sitio funciona en **modo demo**: muestra
propiedades de ejemplo y guarda los cambios solo en ese navegador. El panel acepta cualquier email
y contraseña. Sirve para probar antes de conectar Supabase.

## Probarlo en tu computadora

Cualquier servidor estático sirve, por ejemplo: `npx serve public` y abrí `http://localhost:3000`.

## Notas

- **Fotos:** se achican en el navegador (1600 px, JPG) antes de subirse, así cargan rápido en celulares.
- **Favoritos y comparador:** se guardan en el celular de cada visitante; no requieren cuenta.
- **Vista previa al compartir:** `netlify/edge-functions/vista-previa.js` agrega la foto, el tipo, el barrio y el precio
  de cada propiedad cuando se comparte su link (`?p=CÓDIGO`). WhatsApp guarda la vista previa de cada link, así que un link
  compartido antes del cambio puede seguir mostrando la versión vieja.
