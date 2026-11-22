# Guía del proyecto · Mujeres con Propósito

Todo lo necesario para recordar cómo está montado el proyecto, dónde está cada cosa
y cómo hacer las tareas habituales.

> 🔒 Este archivo no contiene contraseñas ni claves secretas. Las claves viven en
> los paneles de cada servicio (Supabase, Brevo, Apple…) y en tu gestor de contraseñas.

---

## 1. Visión general

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Web** | mcp930.org: HTML/CSS/JS estático | GitHub Pages, rama `main` |
| **Panel de administración** | `mcp930.org/admin.html` | Mismo repositorio |
| **Dashboard de miembros** | `mcp930.org/dashboard.html` | Mismo repositorio |
| **Devocionales** | `mcp930.org/devocionales.html` | Mismo repositorio |
| **App iOS / Android** | Expo (React Native), carpeta `mobile/` | EAS → TestFlight / App Store / Google Play |
| **Servidor** | Base de datos, login, funciones y tareas automáticas | Supabase |
| **Correos** | Avisos, bienvenida, cumpleaños, contraseñas | Brevo (dominio mcp930.org) |
| **Marca** | Logo, iconos, colores | Carpeta `brand/` (ver `brand/README.md`) |

---

## 2. Plataformas y cuentas

| Plataforma | Para qué | Datos de referencia |
|---|---|---|
| **GitHub** | Código y publicación de la web | Repo `macarthurjp/mujeresconproposito` · la web publica la rama `main` |
| **GitHub Pages** | Hosting de mcp930.org | Archivo `CNAME` = `mcp930.org` |
| **Infomaniak** | DNS del dominio y correo `@mcp930.org` | manager.infomaniak.com → Dominios → mcp930.org → Zona DNS |
| **Key-Systems** | Registrador del dominio mcp930.org | — |
| **Supabase** | Base de datos, login, funciones, cron | Proyecto `jkunywiyiyidhyodsbfh` · supabase.com/dashboard |
| **Brevo** | Envío de todos los correos | Remitente `no-reply@mcp930.org` · dominio autenticado (DKIM) · SMTP `smtp-relay.brevo.com:587` |
| **Expo / EAS** | Compilar y subir la app | Cuenta `matmax-consulting` · proyecto `@matmax-consulting/mujeres-con-proposito` · ID `9495d153-1df4-4a87-af3c-c427881945b7` |
| **Apple Developer** | Certificados, notificaciones push, TestFlight | Equipo **MatMax Consulting Sarl-s** (`NNM7Q86Q6F`) · bundle `org.mcp930.app` |
| **App Store Connect** | TestFlight y publicación iOS | App ID `6835226346` |
| **Cloudflare Turnstile** | Verificación "no soy un robot" en Contacto y Únete | Clave pública `0x4AAAAAAEh_oJLzQvnRIJsH` · dominios permitidos: mcp930.org, www.mcp930.org, macarthurjp.github.io |
| **Google Analytics 4** | Estadísticas de la web (solo si la persona acepta) | `G-Y4EMQGHWVQ` |
| **PayPal** | Donaciones | Botón `ZVN8VQZ622B7W` |
| **YouTube** | Videos | youtube.com/@MujeresconProposito930 |
| **SoundCloud** | Audios "Porción" | soundcloud.com/mujeresconproposito930 |
| **Instagram / Facebook** | Redes | `mujeresconproposito930` |
| **Login Apple / Google** | Entrar al panel con Apple o Google | Activados en Supabase → Authentication → Providers |

### Registros DNS importantes (Infomaniak)
| Tipo | Nombre | Valor | Para qué |
|---|---|---|---|
| TXT | (vacío / @) | `v=spf1 include:spf.infomaniak.ch -all` | Correo de Infomaniak |
| TXT | (vacío / @) | `brevo-code:80bc83dd1010c2dee3574fe193867e75` | Verificación de Brevo |
| CNAME | `brevo1._domainkey` | `b1.mcp930-org.dkim.brevo.com` | Firma DKIM de Brevo |
| CNAME | `brevo2._domainkey` | `b2.mcp930-org.dkim.brevo.com` | Firma DKIM de Brevo |
| TXT | `_dmarc` | `v=DMARC1; p=reject;` | Protección contra suplantación (no cambiar a `p=none`) |
| MX | (vacío / @) | `mta-gw.infomaniak.ch` | Correo entrante |

---

## 3. Roles y permisos

Las cuentas solo se crean **por invitación** desde *Usuarios y roles* (el registro libre está desactivado).
Una cuenta nueva no tiene ningún permiso hasta que el Super Admin se lo da. Los permisos se pueden combinar.

| Rol | Qué puede hacer | Qué no puede |
|---|---|---|
| **Super Admin** | Todo: eventos, destacadas, galería, YouTube, banner, devocionales (publicar directo), usuarios y roles, destinatarios de correo, dashboard completo (ver, editar, borrar y exportar miembros) | — |
| **Editor de devocionales** | Escribir borradores, editar los suyos, enviarlos a revisión, borrar los suyos no publicados, subir imágenes del devocional | Publicar sin revisión, ver o tocar otros contenidos |
| **Revisor de devocionales** | Ver la cola de revisión (artículos de otras), pedir cambios, aprobar y publicar | Revisar sus propios artículos, otros contenidos |
| **Manager (exportar)** | Dashboard completo con datos de contacto y exportación (CSV/PDF) | Editar o borrar miembros, panel de administración |
| **Vista simple** | Dashboard sin datos personales (sin correo, teléfono, fecha de nacimiento…) | Ver datos de contacto, exportar |
| **Calendario de cumpleaños** | Recibe por correo, 2 días antes, el aviso de cada cumpleaños | (es un aviso, no da acceso) |
| **Acceso revocado** | Nada | Todo (también aplica a un Super Admin revocado) |

**Dónde entra cada rol:**
- Super Admin, Editor, Revisor → `admin.html` (Editor/Revisor solo ven la pestaña *Devocionales*).
- Manager, Vista simple → `dashboard.html`.
- En la app: *Más → Administración* (mismo login, mismas reglas).

La seguridad la aplica la **base de datos** (reglas RLS), no solo las pantallas: aunque alguien manipule la página, el servidor no le deja hacer más de lo que su rol permite.

---

## 4. Qué se puede hacer en el panel (Super Admin)

| Sección | Acciones |
|---|---|
| **Eventos** | Crear reuniones recurrentes (días, hora, zona horaria, enlace de Meet/Zoom), activar avisos push, ordenar, ocultar (ojo), borrar |
| **Destacadas** | Subir pósters de eventos, título, orden, visible/oculto (ojo) |
| **Galería** | Subir varias fotos a la vez por país y álbum, elegir portada, ordenar álbumes y fotos, ocultar (ojo), editar, borrar |
| **YouTube** | Añadir videos por enlace, etiqueta, orden, ocultar |
| **Devocionales** | Escribir, revisar, publicar, programar fecha, despublicar |
| **Banner** | Aviso flotante en la portada (activar/desactivar) |
| **Usuarios y roles** | Invitar, asignar permisos, revocar/restaurar acceso, enviar enlace de contraseña, cambiar tu correo |
| **Destinatarios de correo** | Quién recibe el formulario de contacto y Únete (por comunidad: Europa, EE. UU., Rep. Dominicana o todas), pausar/quitar |
| **Dashboard** | Ver, buscar, filtrar, editar, borrar y exportar los registros de Únete |

---

## 5. Automatizaciones (cron)

| Tarea | Frecuencia | Qué hace |
|---|---|---|
| `mcp930-meeting-start-push` | Cada minuto | Push 15 min antes y al empezar cada reunión |
| `mcp930-birthday-push` | Cada 15 min | Avisos de cumpleaños elegidos en la app (2 días / 1 día / el día, a la hora elegida) |
| `mcp930-birthday-emails-hourly-check` | Cada hora (envía a las 08:00 Luxemburgo) | Correo "¡Feliz cumpleaños!" a la cumpleañera |
| `mcp930-birthday-reminders-hourly-check` | Cada hora | Correo al equipo con permiso *Calendario de cumpleaños*, 2 días antes |
| `mcp930-database-keepalive` | 06:23 y 18:23 | Mantiene la base de datos activa |
| GitHub `sync-share-pages` | Cada hora | Regenera páginas para compartir devocionales (`d/`), invitadas (`i/`) y `calendario.ics` |

## 6. Funciones del servidor (Supabase Edge Functions)

| Función | Para qué |
|---|---|
| `submit-contact` / `submit-join` | Reciben los formularios (con verificación Turnstile) |
| `send-contact-email` / `send-admin-notification` / `send-welcome-email` | Correos de contacto, aviso de registro y bienvenida (solo llamadas internas) |
| `send-birthday-emails` / `send-birthday-reminders` / `send-birthday-push` | Cumpleaños por correo y push |
| `notify-meeting-start` | Push de reuniones |
| `send-devotional-review-notification` | Aviso a revisoras |
| `manage-users` | Gestión de usuarios (solo Super Admin) |
| `get-today-birthdays` | Cumpleaños de hoy y de la semana (público, sin datos privados) |

**Secretos del servidor** (nombres, no valores): `BREVO_API_KEY`, `FROM_EMAIL`, `EMAIL_FROM`, `FROM_NAME`, `EMAIL_FROM_NAME`, `CONTACT_EMAIL`, `TURNSTILE_SECRET`, `BIRTHDAY_CRON_SECRET`, `MEETING_CRON_SECRET`. Se ven en Supabase → Edge Functions → Secrets.

---

## 7. Tareas habituales

### Publicar cambios de la web
1. Trabajar en una rama, probar en local: `npx http-server -p 8931 -s .` → http://localhost:8931
2. Pruebas: `npx playwright test`
3. Abrir PR a `main` y fusionar → GitHub Pages publica en 1–2 minutos.
4. Si no se ve el cambio: recargar con ⌘⇧R.

### Nueva versión de la app en TestFlight
```
cd ~/Developer/MCP930/mobile
npx eas-cli@latest build -p ios --profile production --auto-submit
```
Pide el Apple ID la primera vez. Apple procesa la compilación en 5–30 min; después aparece en TestFlight.

### Probar la app en el simulador
```
cd ~/Developer/MCP930/mobile
npx expo start            # servidor de desarrollo
npx expo run:ios          # compilar e instalar en el simulador
```

### Desplegar una función del servidor
```
supabase functions deploy <nombre> --project-ref jkunywiyiyidhyodsbfh --no-verify-jwt
```

### Cambiar quién recibe los formularios
Panel → **Destinatarios de correo** (web o app). Cada grupo muestra quién recibe **hoy**:
- Si un grupo no tiene a nadie activo, aparece el correo principal (`CONTACT_EMAIL`) con la etiqueta «Principal». La pantalla lo lee con `manage-users` (acción `form_recipients_fallback`, solo Super Admin).
- Las comunidades muestran también a quienes reciben «Todas las comunidades».
- Al añadir el primer destinatario a un grupo que usaba el principal, el principal se guarda también en la lista para que no deje de recibir sin querer; luego se puede pausar o quitar.

### Notificaciones en la app (campana de Inicio)
La campana de **Inicio** abre *Notificaciones*: los avisos, reuniones, contenido nuevo y cumpleaños que llegaron a ese teléfono. Se guardan en el propio teléfono (no hay inicio de sesión) durante 90 días, máximo 60. Al abrirla se marcan como leídas, se vacía la bandeja del sistema y se pone a 0 el número del icono de la app. Si alguien descarta una notificación desde la bandeja sin abrir la app, esa no queda en la lista. Código: `mobile/src/lib/notification-inbox.ts` y `mobile/src/app/notificaciones.tsx`.

### Añadir a alguien al equipo
Panel → **Usuarios y roles** → *Crear nuevo usuario* → elegir permisos. Le llega una invitación por correo para crear su contraseña.

---

## 8. Mantenimiento y cosas a recordar

- **Clave SMTP de Brevo** (usada por Supabase para invitaciones y contraseñas): caduca tras **90 días sin uso**. Si las invitaciones dejan de llegar, generar otra en Brevo → SMTP & API y pegarla en Supabase → Authentication → Emails → SMTP Settings.
- **Plantillas de correo de Supabase** (invitación y recuperar contraseña): están en `supabase/templates/`. Se pegan en Supabase → Authentication → Emails → Templates.
- **Apple Developer** se renueva cada año; si caduca, la app deja de poder actualizarse.
- **Nombre interno de la app** = `Mujeres con Proposito` (sin tilde, necesario para EAS). El nombre visible sigue siendo "Mujeres con Propósito".
- **Logo y marca**: usar siempre los archivos de `brand/`.
- **Migraciones de base de datos**: `supabase/migrations/`. Todas están aplicadas a día 15/11/2026.
