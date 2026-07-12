# Mujeres con Propósito

Sitio web oficial y sistema administrativo de **Mujeres con Propósito**, una comunidad cristiana internacional enfocada en la fe, la hermandad, el crecimiento espiritual y el propósito.

- Sitio público: <https://macarthurjp.github.io/mujeresconproposito/>
- Repositorio: <https://github.com/macarthurjp/mujeresconproposito>
- Backend: Supabase, proyecto `MujeresConProposito`
- Referencia de Supabase: `jkunywiyiyidhyodsbfh`
- Proveedor de correo: Brevo
- Audio: playlist pública de SoundCloud
- Estado documentado: 12 de julio de 2026

## Funcionalidades principales

### Sitio público

- Página institucional adaptable a escritorio y móvil.
- Secciones de misión, visión, eventos, invitadas destacadas, galería, donaciones y contacto.
- Carrusel automático de eventos.
- Carrusel automático de destacadas cada 5 segundos.
- Pausa de carruseles al tocar, usar las flechas o pasar el cursor.
- Respeto de `prefers-reduced-motion` en el carrusel de destacadas.
- Reproductor personalizado conectado a SoundCloud.
- Calendario dinámico con actividades y cumpleaños del día.
- Orden cronológico real para horarios AM/PM y formatos europeos como `19h` o `20:00`.
- Formulario de inscripción conectado directamente a Supabase.
- Formulario de contacto con almacenamiento y notificación por correo.
- Página de confirmación que permanece 5 segundos y regresa al inicio.

### Administración

- Autenticación mediante Supabase Auth.
- Inicio de sesión opcional con passkey, Face ID o huella después de establecer una sesión válida.
- Administración de eventos, destacadas y galería.
- Carga de imágenes al bucket `mcp930-images`.
- Dashboard privado de personas registradas.
- Búsqueda y filtros por país, comunidad y estado cristiano.
- Actualización manual de registros y actualización al regresar a la pestaña.
- Exportación del dashboard a PDF.
- Recuperación de contraseña.

### Correos automáticos

- Bienvenida personalizada a cada nueva integrante.
- Notificación administrativa con todos los datos del formulario.
- Notificación del formulario de contacto.
- Felicitación de cumpleaños con protección contra duplicados.
- Plantillas visuales unificadas con la paleta oficial.

## Arquitectura

```text
GitHub Pages
└── HTML + CSS + JavaScript estático
    ├── Supabase REST
    │   ├── registros
    │   ├── eventos
    │   ├── destacadas
    │   └── galería
    ├── Supabase Auth
    │   ├── admin
    │   ├── dashboard
    │   └── recuperación de contraseña
    ├── Supabase Storage
    │   └── mcp930-images
    ├── Supabase Edge Functions
    │   └── Brevo
    └── SoundCloud Widget API
```

El frontend es completamente estático. No utiliza Node.js, Vite ni un proceso de compilación para producción. GitHub Pages sirve directamente los archivos del repositorio.

## Páginas

| Archivo | Propósito |
| --- | --- |
| `index.html` | Sitio público, formularios, calendario, carruseles y reproductor |
| `admin.html` | Administración privada de contenido |
| `dashboard.html` | Consulta privada de registros y exportación PDF |
| `gracias-unirse.html` | Confirmación del formulario y retorno automático |
| `reset-password.html` | Recuperación y actualización de contraseña |

## Estructura del proyecto

```text
.
├── index.html
├── admin.html
├── dashboard.html
├── gracias-unirse.html
├── reset-password.html
├── assets/
│   ├── css/
│   │   ├── style.css
│   │   └── dashboard.css
│   ├── images/
│   └── js/
│       ├── main.js
│       ├── dashboard.js
│       ├── passkey-auth.js
│       ├── reset-password.js
│       └── supabase.js
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   └── functions/
├── supabase-schema.sql
├── migrate-google-sheet-to-supabase.js
└── migrate-images-to-supabase-storage.js
```

## Modelo de datos

### `public.unirse`

Almacena las solicitudes para unirse a la comunidad:

- nombre y apellido;
- correo y teléfono;
- fecha de nacimiento;
- estatus matrimonial;
- país de nacimiento y residencia;
- comunidad seleccionada;
- estado cristiano;
- cantidad de hijos;
- comentarios;
- marca `ultimo_correo_cumpleanos` para evitar envíos duplicados.

### `public.contact_messages`

Almacena los mensajes enviados desde el formulario de contacto.

### `public.eventos`

Contiene las actividades mostradas en el carrusel y calendario. El campo `horario` admite formatos como:

- `Domingos · 4:00 PM`
- `Lunes a Viernes · 5:00 AM`
- `Viernes · 20:00`
- `Martes · 19h`

### `public.destacadas`

Contiene fotografía, nombre, título, orden y estado de las invitadas destacadas.

### `public.galeria`

Contiene las imágenes organizadas por categoría o comunidad.

## Seguridad y RLS

Row Level Security está habilitado en las tablas públicas.

- Visitantes anónimos pueden leer eventos, destacadas y galería activos.
- Visitantes anónimos pueden insertar formularios en `unirse` y `contact_messages`.
- Visitantes anónimos no pueden leer registros privados.
- Usuarios autenticados pueden consultar `unirse` desde el dashboard.
- Usuarios autenticados pueden administrar eventos, destacadas, galería y Storage.
- La clave `service_role` nunca debe aparecer en HTML o JavaScript público.

La clave `sb_publishable_...` utilizada por el navegador es pública por diseño. La seguridad real depende de las políticas RLS.

## Flujo de registro

1. La visitante completa el formulario de `index.html`.
2. El navegador valida y normaliza los datos.
3. Se genera un UUID para el registro.
4. El registro se inserta en `public.unirse`.
5. Se ejecutan de forma independiente:
   - correo de bienvenida;
   - notificación administrativa;
   - comprobación inmediata de cumpleaños.
6. Los fallos de correo no eliminan un registro guardado correctamente.
7. La visitante llega a `gracias-unirse.html`.
8. Después de 5 segundos regresa automáticamente a la página principal.

## Edge Functions

| Función | Propósito |
| --- | --- |
| `send-welcome-email` | Envía el correo de bienvenida premium |
| `send-admin-notification` | Avisa al administrador sobre un registro |
| `send-contact-email` | Reenvía mensajes del formulario de contacto |
| `send-birthday-emails` | Envía cumpleaños inmediatos y programados |
| `get-today-birthdays` | Devuelve nombres para el calendario público |

Las plantillas de bienvenida, administración y cumpleaños comparten:

- fondo marfil `#f8f4f3`;
- borgoña `#8f4547`;
- rosa suave `#e7a39a`;
- bordes cálidos y estructura compatible con Gmail, Outlook y móviles;
- versión de texto cuando el cliente bloquea HTML.

## Automatización de cumpleaños

El sistema tiene dos capas de protección:

### Comprobación inmediata

Después de cada registro se llama `send-birthday-emails` con el UUID recién creado. La función:

- consulta únicamente ese registro;
- compara mes y día usando `Europe/Luxembourg`;
- envía solo si el cumpleaños es hoy;
- actualiza `ultimo_correo_cumpleanos`.

### Cron de respaldo

La migración `20260712213500_schedule_luxembourg_birthday_emails.sql` crea un cron horario. La función solo procesa la lista completa durante la hora de las **08:00 en Luxemburgo**.

Esto evita problemas por horario de verano y cubre casos en los que el envío inmediato haya fallado. La marca `ultimo_correo_cumpleanos` impide duplicados durante el mismo día.

## Secretos de Supabase

Configurar con `supabase secrets set`. Documentar nombres, nunca valores.

| Secreto | Uso |
| --- | --- |
| `BREVO_API_KEY` | Autenticación con Brevo |
| `EMAIL_FROM` | Remitente usado por las funciones compartidas |
| `EMAIL_FROM_NAME` | Nombre opcional del remitente compartido |
| `FROM_EMAIL` | Remitente de notificaciones y cumpleaños |
| `FROM_NAME` | Nombre del remitente de notificaciones y cumpleaños |
| `CONTACT_EMAIL` | Destinatario administrativo |
| `BIRTHDAY_CRON_SECRET` | Autoriza ejecuciones administrativas del cumpleaños |
| `SUPABASE_SERVICE_ROLE_KEY` | Lectura y actualización privada desde funciones |

`SUPABASE_URL` es proporcionado automáticamente por Supabase dentro de las Edge Functions.

Consultar secretos sin mostrar sus valores:

```bash
supabase secrets list --project-ref jkunywiyiyidhyodsbfh
```

## Desarrollo local

Este proyecto no tiene `package.json`. Para ejecutarlo localmente:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Abrir:

```text
http://127.0.0.1:4173/
```

No abrir `index.html` directamente mediante `file://`, porque Supabase Auth, passkeys y varios recursos externos necesitan un contexto HTTP o HTTPS.

## Validación técnica

### JavaScript del navegador y scripts de migración

```bash
for file in $(find . -name '*.js' -not -path './.git/*'); do
  node --check "$file"
done
```

### Edge Functions

```bash
for file in $(find supabase/functions -name '*.ts'); do
  deno check "$file"
done
```

### HTML y recursos

Levantar el servidor local y verificar que respondan `200`:

```bash
curl -I http://127.0.0.1:4173/index.html
curl -I http://127.0.0.1:4173/admin.html
curl -I http://127.0.0.1:4173/dashboard.html
curl -I http://127.0.0.1:4173/gracias-unirse.html
curl -I http://127.0.0.1:4173/reset-password.html
```

### Estado Git

```bash
git status --short --branch
git diff --check
```

## Supabase CLI

Iniciar sesión y comprobar el proyecto:

```bash
supabase login
supabase projects list
```

El proyecto correcto debe aparecer enlazado como:

```text
jkunywiyiyidhyodsbfh  MujeresConProposito
```

Aplicar migraciones:

```bash
supabase db push --linked --dry-run
supabase db push --linked
```

Desplegar funciones:

```bash
supabase functions deploy send-welcome-email --project-ref jkunywiyiyidhyodsbfh
supabase functions deploy send-admin-notification --project-ref jkunywiyiyidhyodsbfh
supabase functions deploy send-contact-email --project-ref jkunywiyiyidhyodsbfh
supabase functions deploy send-birthday-emails --project-ref jkunywiyiyidhyodsbfh
supabase functions deploy get-today-birthdays --project-ref jkunywiyiyidhyodsbfh
```

Listar versiones activas:

```bash
supabase functions list --project-ref jkunywiyiyidhyodsbfh
```

## Publicación en GitHub Pages

El repositorio publicado es:

```text
https://github.com/macarthurjp/mujeresconproposito
```

Publicar:

```bash
git add .
git commit -m "Descripción del cambio"
git push origin main
```

GitHub Pages ejecuta automáticamente `pages-build-deployment`. Verificar con:

```bash
gh run list --repo macarthurjp/mujeresconproposito --limit 5
```

Después de publicar, confirmar el contenido real en:

```text
https://macarthurjp.github.io/mujeresconproposito/
```

Cuando se actualiza un JavaScript o CSS, cambiar su parámetro `?v=` en las páginas HTML para evitar caché anterior.

## SoundCloud

El reproductor no almacena contraseñas ni claves API. Utiliza el widget oficial y una playlist pública.

- Cuenta: `MujeresConProposito930`
- Perfil: <https://soundcloud.com/mujeresconproposito930>
- Playlist: <https://soundcloud.com/mujeresconproposito930/sets/mujeres-con-proposito-porcion>
- ID interno de playlist: `2219880689`

Para modificar los audios, editar esa playlist directamente en SoundCloud. El sitio intenta reconectar si la API tarda y muestra un enlace alternativo si el widget no responde.

## Imágenes

- Las imágenes locales viven en `assets/images/`.
- GitHub Pages distingue mayúsculas y minúsculas.
- Usar rutas relativas, por ejemplo `assets/images/logo.webp`.
- CSS dentro de `assets/css/` utiliza `../images/...`.
- El sitio usa WebP optimizado para el logo y las destacadas.
- Los originales PNG/JPG permanecen como respaldo.
- Las imágenes administradas se guardan en el bucket público `mcp930-images`.

## Migraciones auxiliares

### Google Sheet a Supabase

```bash
SHEET_CSV_URL="..." \
SUPABASE_URL="..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
node migrate-google-sheet-to-supabase.js
```

### Imágenes locales a Storage

```bash
SUPABASE_URL="..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
node migrate-images-to-supabase-storage.js
```

No guardar `SUPABASE_SERVICE_ROLE_KEY` en el repositorio.

## Operación diaria

### Agregar eventos

1. Entrar en `admin.html`.
2. Iniciar sesión con una cuenta autorizada.
3. Agregar título, horario, enlace, icono y orden.
4. Mantener el horario en uno de los formatos reconocidos.
5. Confirmar el evento en el carrusel y calendario público.

### Agregar destacadas

1. Subir la imagen desde el administrador.
2. Completar nombre, título y orden.
3. Mantener el registro activo.
4. Confirmar el avance automático del carrusel.

### Revisar registros

1. Entrar en `dashboard.html`.
2. Iniciar sesión.
3. Pulsar **Actualizar registros** si la pestaña estaba abierta.
4. Usar filtros o exportar PDF.

## Resolución de problemas

### El formulario no guarda

- Comprobar que la clave pública sigue vigente.
- Verificar que `public insert unirse` esté activa.
- Revisar la respuesta de Supabase en la consola del navegador.

### Los registros no aparecen en el dashboard

- Confirmar una sesión válida de Supabase Auth.
- Pulsar **Actualizar registros**.
- Verificar la política `authenticated read unirse`.

### Un correo no llega

- Revisar spam y promociones.
- Confirmar secretos de Brevo y remitente verificado.
- Consultar el estado de la Edge Function.
- Verificar que el formulario haya sido guardado antes del intento de correo.

### El cumpleaños no se envía

- Confirmar que `fecha_nacimiento` usa `YYYY-MM-DD`.
- Verificar `ultimo_correo_cumpleanos`.
- Confirmar que el cron y `send-birthday-emails` estén activos.
- Recordar que la zona horaria operativa es `Europe/Luxembourg`.

### SoundCloud queda cargando

- Confirmar que la playlist siga pública.
- Revisar bloqueadores de contenido.
- Usar **Ver playlist** como alternativa.

### GitHub Pages muestra archivos anteriores

- Confirmar que `pages-build-deployment` terminó correctamente.
- Actualizar el parámetro `?v=`.
- Recargar con `Cmd + Shift + R`.

## Lista de cierre antes de publicar

- [ ] `git status` no contiene cambios inesperados.
- [ ] `git diff --check` no reporta errores.
- [ ] Todos los `.js` pasan `node --check`.
- [ ] Todas las Edge Functions pasan `deno check`.
- [ ] Las páginas y recursos principales responden `200` localmente.
- [ ] No hay claves `service_role`, contraseñas o secretos dentro del commit.
- [ ] Las migraciones necesarias fueron aplicadas primero con `--dry-run`.
- [ ] Las Edge Functions modificadas fueron desplegadas.
- [ ] El commit fue enviado a `main`.
- [ ] GitHub Pages terminó con estado `success`.
- [ ] El sitio público sirve la versión nueva.

## Notas de seguridad

- Nunca publicar `BREVO_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, contraseñas o secretos cron.
- No copiar valores de secretos a documentación, capturas o commits.
- Rotar una clave si fue expuesta fuera de un entorno autorizado.
- Mantener la lectura de registros limitada al rol `authenticated`.
- Las passkeys complementan la sesión de Supabase; no reemplazan la autorización del backend.

