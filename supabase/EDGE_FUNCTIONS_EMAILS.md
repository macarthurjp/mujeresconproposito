# Edge Functions para correos

Estas funciones reemplazan los correos que antes dependian de Google Apps Script.

## Proveedor de email

Las funciones usan Brevo. Debes configurar estos secretos en Supabase:

```bash
supabase secrets set BREVO_API_KEY="tu_brevo_api_key"
supabase secrets set EMAIL_FROM="noreply@tu-dominio.com"
supabase secrets set EMAIL_FROM_NAME="Mujeres con Proposito"
supabase secrets set CONTACT_EMAIL="correo-admin@tu-dominio.com"
supabase secrets set BIRTHDAY_CRON_SECRET="un-secreto-largo"
```

Tambien puedes guardar `EMAIL_FROM` con este formato si prefieres mantenerlo en una sola variable:

```bash
supabase secrets set EMAIL_FROM="Mujeres con Proposito <noreply@tu-dominio.com>"
```

Ese correo debe estar verificado/autorizado en Brevo para poder enviar.

Supabase ya provee `SUPABASE_URL`. Para la funcion de cumpleanos tambien necesitas:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="tu_service_role_key"
```

No pongas la service role key en archivos publicos del sitio.

## Deploy

```bash
supabase functions deploy send-welcome-email
supabase functions deploy send-admin-notification
supabase functions deploy send-contact-email
supabase functions deploy send-birthday-emails
```

## Bienvenida al unirse

El formulario web llama automaticamente:

```text
send-welcome-email
```

despues de guardar el registro en `public.unirse`.

Tambien llama:

```text
send-admin-notification
```

para avisar al administrador del nuevo registro.

## Contacto

El formulario de contacto guarda el mensaje en `public.contact_messages` y llama:

```text
send-contact-email
```

para enviar el mensaje al correo definido en `CONTACT_EMAIL`.

## Cumpleanos

Programa una llamada diaria a:

```text
send-birthday-emails
```

con header:

```text
x-cron-secret: el_mismo_valor_de_BIRTHDAY_CRON_SECRET
```

Recomendacion: ejecutarla una vez al dia en la manana, usando zona horaria Europe/Luxembourg.

La funcion:

- Lee `public.unirse`.
- Detecta cumpleanos del dia.
- Envia correo.
- Actualiza `ultimo_correo_cumpleanos` para no duplicar envios ese mismo dia.
