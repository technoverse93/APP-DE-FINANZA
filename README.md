# APP-DE-FINANZA

Aplicación de finanzas personales en React Native/Expo con Supabase. Captura
gastos leyendo comprobantes de SINPE y del BCR directamente desde el correo, y
distribuye la nómina quincenal protegiendo un margen de seguridad.

## Arquitectura

```
Gmail (IMAP) ─┐
              ├─→ Edge Function email-sync (Deno) ─→ Supabase Postgres ─→ App (Expo)
Outlook (IMAP)┘        ▲                                                    ▲
                       │                                             huella obligatoria
              pg_cron cada 30 min
```

**El IMAP corre en el servidor, no en el teléfono.** No es una preferencia de
estilo, es la única ubicación donde funciona:

- React Native no expone sockets TCP. `fetch`, `XMLHttpRequest` y `WebSocket`
  son los únicos transportes disponibles, e IMAP necesita un socket TLS crudo
  contra el puerto 993. Las librerías IMAP de npm dependen de los módulos `net`
  y `tls` de Node, que no existen en el runtime de RN.
- Un intervalo exacto de 30 minutos no es algo que un dispositivo pueda
  prometer: Doze en Android y la planificación oportunista de iOS espacian las
  tareas en segundo plano según batería y uso. `pg_cron` sí dispara exacto.
- Mantiene las credenciales de correo fuera del teléfono, en Supabase Vault.

El runtime Deno de las Edge Functions sí tiene `Deno.connectTls`, así que el
cliente IMAP de `supabase/functions/_shared/imap.ts` habla el protocolo directo
—sin API de Gmail ni de Graph— tal como se pidió.

La app además puede pedir una pasada manual (`pedirSincronizacion`) y registra
una tarea en segundo plano como refuerzo, pero el cron del servidor es la
fuente de verdad del intervalo.

## Autenticación de correo

| Proveedor | Método | Motivo |
|---|---|---|
| Gmail | `AUTHENTICATE PLAIN` con contraseña de aplicación | Google desactivó la contraseña normal en IMAP; la contraseña de aplicación (requiere 2FA activo) sigue vigente |
| Outlook | `AUTHENTICATE XOAUTH2` con token OAuth2 | Microsoft retiró la autenticación básica de IMAP; una contraseña de aplicación ya no autentica |

Ambos métodos están implementados. El secreto de cada cuenta se guarda en
Supabase Vault y `cuentas_correo.secreto_ref` solo almacena su nombre.

## Reglas de negocio

**Calendario.** Pagos el 13 y el 28. Si caen sábado se adelantan al viernes
(−1 día); si caen domingo, al viernes también (−2 días). La ventana para
ingresar la colilla abre exactamente 48 h antes de la fecha **ya ajustada** y
cierra al terminar el día de pago. Los cálculos usan el UTC−6 fijo de Costa
Rica, así que no dependen de la zona horaria del teléfono.

**Distribución.** `remanente = colilla − (casa + comida + pases + deuda base)`.
Sobre ese remanente se protege la banda de 170.000–175.000 colones:

| Remanente | Estado | Reserva | Abono a capital |
|---|---|---|---|
| < 170.000 | `deficit` | todo lo que haya | 0, y se reporta cuánto falta |
| 170.000 – 175.000 | `ajustado` | el remanente completo | 0 |
| > 175.000 | `holgado` | 175.000 | el excedente |

En estado `holgado` se sugiere el abono conservador (conservar el techo) y se
expone el rango hasta el abono agresivo (conservar el piso).

**Filtro del BAC.** Es absoluto y corre antes que cualquier otro análisis:
si el remitente, el asunto o el cuerpo contienen un marcador del BAC, el correo
se descarta sin intentar reconocer banco ni monto. `\bBAC\b` usa límites de
palabra para no capturar "BACKUP" ni "tabaco".

## Seguridad

El bloqueo biométrico no solo oculta la interfaz. `src/lib/supabase.ts` inyecta
un `fetch` propio en el cliente de Supabase que **rechaza toda petición**
mientras la app está bloqueada; como el cliente canaliza todo su tráfico por ahí,
ninguna consulta escapa aunque una pantalla se monte por error. `disableDeviceFallback:
true` elimina el respaldo por PIN o contraseña: la huella es el único acceso.
Al mandar la app a segundo plano se vuelve a cortar la red y a exigir la huella.

Todas las tablas llevan RLS con políticas por `auth.uid()`.

`src/lib/supabase.ts` nunca lanza una excepción a nivel de módulo, ni siquiera
si faltan las variables de entorno: ese archivo se importa de forma estática
desde `App.tsx`, así que un `throw` ahí mata la app entera antes de que React
monte una sola pantalla — se ve como un cierre inmediato al abrirla, sin
ErrorBoundary que lo pueda atrapar. Si faltan las variables, `supabase`
degrada a un cliente que rechaza cualquier operación (capturado por el mismo
manejo de errores que ya existe en `useQuincena`/`backgroundSync`) en vez de
crashear. `ErrorBoundary` en la raíz es la red de último recurso para
cualquier otra excepción de render que se escape.

## Actualizaciones OTA (EAS Update)

`app.json` ya tiene `runtimeVersion`, `updates` y el plugin `expo-updates`
configurados, y `App.tsx` llama `comprobarActualizacion()` al montar (con
cada paso en su propio try/catch: sin red, con el servidor caído, o con un
bundle corrupto a mitad de descarga, la app sigue con el bundle local).

Falta un solo dato que no se puede generar sin una cuenta de Expo: el
`projectId` real. `app.json` lo deja como placeholder explícito
(`REEMPLAZA_CON_TU_EAS_PROJECT_ID`) en `updates.url` y en
`extra.eas.projectId` — con ese placeholder la comprobación de actualizaciones
simplemente falla (de forma segura) y la app sigue funcionando con el bundle
local, igual que sin red. Para activarlo de verdad:

```bash
eas login
eas init          # crea el proyecto y escribe el projectId real en app.json
```

Publicar una actualización, una vez configurado:

```bash
eas update --branch production --message "descripción del cambio"
```

## Puesta en marcha

```bash
npm install
cp .env.example .env        # completar URL y anon key
npm start                   # Expo
```

Base de datos y función:

```bash
supabase db push                        # migraciones 0001 y 0002
supabase functions deploy email-sync
```

Antes de que el cron funcione hay que cargar en Vault los secretos
`edge_url_email_sync` y `service_role_key`, más el secreto de cada cuenta de
correo referenciado por `cuentas_correo.secreto_ref`.

## Verificación

```bash
npm test        # 83 pruebas: calendario, distribución, parsing, IMAP
npm run typecheck
```

Las Edge Functions se verifican aparte, con `deno check supabase/functions/_shared/*.ts`.

## Estado

Implementado y probado: motor quincenal, calendario de pagos, parsing de
correos con filtro del BAC, cliente IMAP, puerta biométrica, design system y
esquema de base de datos.

Pendiente de datos reales: los patrones de extracción de monto, referencia y
contraparte se escribieron contra las convenciones costarricenses habituales
(₡, CRC, ambos formatos de separador de miles), no contra correos reales del
BCR. Al conectar la primera cuenta conviene revisar `corridas_sync` y ajustar
las expresiones de `_shared/parse.ts` con los comprobantes que efectivamente
lleguen.
