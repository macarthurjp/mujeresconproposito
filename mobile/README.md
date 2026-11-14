# Mujeres con Propósito — App móvil (iOS y Android)

App nativa hecha con Expo (SDK 58) y Expo Router. Usa el mismo proyecto de Supabase que el sitio web.

## Módulos

| Pestaña | Contenido |
| --- | --- |
| Inicio | Hero, reunión en vivo, activar avisos, próximas reuniones, versículo, Destacadas, YouTube |
| Reuniones | Eventos con estado "En vivo ahora", próxima fecha en la hora local del teléfono y botón **Unirme** |
| Devocional | Lista y lectura de devocionales publicados, compartir |
| Aportar | Código QR y datos de cuenta (tabla `cuentas_aporte`) con botón **Copiar** y enlace de pago |
| Más | Galería, Destacadas, Música (SoundCloud), YouTube, Únete, Contacto, ajustes de avisos, redes |

Únete y Contacto abren los formularios del sitio, porque usan la verificación de Cloudflare Turnstile.

## Notificación "La reunión ha comenzado"

1. Al activar los avisos, la app registra su token de Expo con la RPC `register_push_token`.
2. Un cron de Supabase llama a `notify-meeting-start` cada minuto.
3. La función interpreta el `horario` de cada evento (`Martes · 19h`, `Lunes y Jueves · 7:30 PM`, `Diario · 20h`…) en su `zona_horaria`. Cuando una reunión acaba de empezar, envía la notificación una sola vez por ocurrencia.
4. Al tocar la notificación, o su botón **Unirme**, se abre el enlace del evento. Zoom, Meet, Teams y YouTube abren su app directamente si está instalada. Esto también funciona si la app estaba cerrada.

En el admin web, cada evento tiene ahora **Zona horaria** y **Notificación push**.

## Puesta en marcha (una sola vez)

```bash
# 1. Base de datos: crear el secreto y aplicar la migración
#    (en el SQL editor de Supabase, con un valor aleatorio largo)
select vault.create_secret('<SECRETO>', 'meeting_cron_secret', 'Cron avisos de reuniones MCP930');
supabase db push        # aplica 20261114120000_add_mobile_app_push_and_donation_accounts.sql

# 2. Edge Function
supabase secrets set MEETING_CRON_SECRET='<SECRETO>'
supabase functions deploy notify-meeting-start

# 3. Proyecto EAS (crea el projectId y lo escribe en app.json)
cd mobile
npm install
npx eas-cli@latest init
```

Para iOS, EAS crea la clave APNs la primera vez que ejecutas `eas build`. Para Android, sube la clave de servicio de FCM v1 con `npx eas-cli@latest credentials`. Consulta la guía: https://docs.expo.dev/push-notifications/push-notifications-setup/

### Probar sin enviar

```bash
curl -X POST https://jkunywiyiyidhyodsbfh.supabase.co/functions/v1/notify-meeting-start \
  -H "x-cron-secret: <SECRETO>" -H "Content-Type: application/json" \
  -d '{"dryRun": true, "at": "2026-11-17T18:02:00Z"}'
```

La respuesta lista qué eventos se notificarían en ese instante. También muestra los horarios que no se pudieron interpretar.

## Desarrollo

```bash
cd mobile
npm install
npx expo start          # Expo Go sirve para las pantallas
npx expo run:ios        # o un development build: necesario para probar push
npx tsc --noEmit && npx expo lint
```

Las notificaciones push solo funcionan en un dispositivo físico con un development build o una build de tienda.

## Publicar

```bash
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios
npx eas-cli@latest submit --platform android
```

Identificador de app: `org.mcp930.app` (iOS y Android).

## Aportes y tiendas

La app solo **muestra** el QR y los datos de cuenta, y abre PayPal en el navegador. No procesa pagos dentro de la app, así no aplican las reglas de compras integradas de Apple y Google. Las cuentas se gestionan en la tabla `cuentas_aporte` desde Supabase.
