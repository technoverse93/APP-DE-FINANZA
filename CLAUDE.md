# APP-DE-FINANZA

Aplicación de finanzas personales. Este archivo define las reglas de trabajo
permanentes para Claude Code en este repositorio.

## Flujo de git/despliegue: autorización permanente

El dueño del repositorio autorizó de forma permanente que hagas, **sin pedir
confirmación cada vez**:

- `git commit` y `git push` de cambios de código a la rama de trabajo.
- Abrir Pull Requests.
- Fusionarlos a `main` (squash) una vez que el código compila y no hay
  bloqueos reales.

Un check de CI huérfano, proveniente de una integración no relacionada con el
diff, **no** cuenta como bloqueo real.

Esto es autorización permanente de verdad: no hace falta pedir luz verde en
cada tarea para commitear, pushear, abrir el PR o fusionarlo. Cubre
específicamente `merge_pull_request` con `squash` — el método normal de
cierre — no `merge` ni `rebase` salvo que se pida explícitamente.

Lo que esta autorización **no** cubre, porque son acciones de blast radius
distinto (afectan al repo o a personas más allá de este PR, y no se deshacen
con un simple revert): force-push más allá del caso documentado de
recuperación tras un squash-merge, borrar ramas o el repositorio, cambiar
colaboradores/accesos/visibilidad del repo, o tocar secretos/webhooks desde
la configuración de GitHub. Esas siguen pidiendo confirmación puntual.

## Lo que SIGUE necesitando confirmación explícita

Estas acciones nunca se ejecutan sin que el dueño lo confirme en el momento:

- Cambios directos en datos de producción: bases de datos, borrar filas,
  ejecutar migraciones destructivas, resetear contraseñas de cuentas reales.
- Cualquier acción que otorgue, revoque o modifique el acceso de una persona
  real al sistema (roles, permisos, invitaciones, claves de API a nombre de
  alguien).
- Por tratarse de una app de finanzas: tocar saldos, movimientos,
  transacciones o cualquier registro financiero de usuarios reales, aunque
  sea para "corregirlo".

Escribir código que *implemente* estas funcionalidades está autorizado. Lo que
requiere confirmación es *ejecutar* la acción contra datos o cuentas reales.

## Flujo por tarea de código

```bash
git fetch origin main
git checkout -B <rama> origin/main
# hacer los cambios
git add <archivos específicos>      # nunca -A
git commit -m "..."                 # con heredoc
git push -u origin <rama>
```

Reglas del flujo:

- `git add` siempre con rutas específicas, nunca `-A` ni `.`.
- El mensaje de commit se escribe con heredoc y termina con el pie
  `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Si el push falla por `non-fast-forward` después de un squash-merge previo:

  ```bash
  git fetch origin main
  git checkout -B <rama> origin/main
  # recommitear lo pendiente
  git push --force-with-lease
  ```

- Abrir el PR **siempre con `base: main` explícito**, nunca dejando que GitHub
  elija la base por defecto.
- Revisar que los checks de CI no muestren bloqueos reales, y fusionar con
  **squash**.
- Si el push falla por un error de red, reintentar hasta 4 veces con espera
  creciente (2s, 4s, 8s, 16s).
