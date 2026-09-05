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

Guarda exactamente el mismo valor en Supabase Vault para que `pg_cron`
pueda enviarlo sin almacenarlo en el repositorio:

```sql
select vault.create_secret(
  'un-secreto-largo',
  'birthday_cron_secret',
  'Autoriza el cron de cumpleaños MCP930'
);
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
supabase functions deploy send-devotional-review-notification
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

## Devocional enviado a revision

El panel de admin llama automaticamente a `send-devotional-review-notification`
justo despues de que un Editor envia un devocional a revision (RPC
`devocional_submit_for_review`). La funcion:

- Verifica la sesion del que llama (debe ser el Editor dueno del articulo, o
  Super Admin) usando `SUPABASE_SERVICE_ROLE_KEY`.
- Confirma que el devocional este en estado `en_revision`.
- Busca en `user_roles` a todos los usuarios no revocados con permiso
  `reviewer` (o Super Admin) y les envia un correo con el titulo y un enlace
  a `admin.html`.

Si nadie tiene el rol Revisor asignado, no falla: responde `notified: 0` y
el articulo simplemente espera en la cola hasta que alguien lo revise.
