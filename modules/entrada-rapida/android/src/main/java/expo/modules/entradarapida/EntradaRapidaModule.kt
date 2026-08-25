package expo.modules.entradarapida

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Puente de JavaScript al módulo de entrada rápida.
 *
 * La app de React Native es la única que se autentica contra Supabase; el
 * widget y la ventana emergente solo consumen lo que ella deja escrito. Este
 * módulo es por donde pasa eso: la sesión, el remanente a mostrar, y las dos
 * consultas de permisos que la pantalla de ajustes necesita para saber qué
 * pedirle al usuario.
 */
class EntradaRapidaModule : Module() {

  private val contexto: Context
    get() = requireNotNull(appContext.reactContext) { "No hay contexto de React" }

  override fun definition() = ModuleDefinition {
    Name("EntradaRapida")

    /** Proyecto de Supabase contra el que escribe el código nativo. */
    Function("configurar") { url: String, anonKey: String ->
      PuenteDatos.guardarConfiguracion(contexto, url, anonKey)
    }

    /**
     * Espeja la sesión para que el widget pueda escribir sin abrir la app.
     *
     * Esto es, a propósito, una copia del token fuera del alcance de la puerta
     * biométrica: es el precio de poder anotar sin desbloquear. Queda cifrada
     * con el Keystore y las políticas RLS la limitan a las filas del propio
     * usuario.
     */
    Function("guardarSesion") { accessToken: String, refreshToken: String, usuarioId: String ->
      PuenteDatos.guardarSesion(contexto, accessToken, refreshToken, usuarioId)
      WidgetFinanzas.refrescarTodos(contexto)
    }

    Function("limpiarSesion") {
      PuenteDatos.limpiarSesion(contexto)
      WidgetFinanzas.refrescarTodos(contexto)
    }

    Function("actualizarRemanente") { remanente: Double ->
      PuenteDatos.guardarRemanente(contexto, remanente)
      WidgetFinanzas.refrescarTodos(contexto)
    }

    Function("mostrarMonto") {
      PuenteDatos.mostrarMonto(contexto)
    }

    Function("guardarMostrarMonto") { mostrar: Boolean ->
      PuenteDatos.guardarMostrarMonto(contexto, mostrar)
      WidgetFinanzas.refrescarTodos(contexto)
    }

    /** Cuántos movimientos anotados sin red esperan para subir. */
    Function("pendientes") {
      PuenteDatos.pendientes(contexto).length()
    }

    /**
     * Vacía la cola. Corre en el hilo de JS a través de AsyncFunction para no
     * bloquear la interfaz mientras hace peticiones de red.
     */
    AsyncFunction("sincronizarPendientes") {
      val enviadas = RepositorioMovimientos.sincronizarPendientes(contexto)
      WidgetFinanzas.refrescarTodos(contexto)
      enviadas
    }

    /**
     * Los dos permisos son de concesión manual: Android no deja pedirlos con
     * un diálogo. Lo único que puede hacer la app es llevar al usuario a la
     * pantalla correcta de Ajustes.
     */
    Function("permisoSuperposicion") {
      Settings.canDrawOverlays(contexto)
    }

    Function("accesibilidadActiva") {
      accesibilidadHabilitada()
    }

    Function("abrirAjustesSuperposicion") {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${contexto.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      contexto.startActivity(intent)
    }

    Function("abrirAjustesAccesibilidad") {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      contexto.startActivity(intent)
    }

    /** Abre la ventana emergente desde la app, para poder probarla. */
    Function("abrirVentanaPrueba") {
      val intent = Intent(contexto, EntradaRapidaActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      contexto.startActivity(intent)
    }
  }

  /**
   * No existe una API directa para "¿está mi servicio de accesibilidad
   * encendido?": hay que buscar el nombre del componente dentro de la lista
   * separada por dos puntos que el sistema guarda en Settings.Secure.
   */
  private fun accesibilidadHabilitada(): Boolean {
    val habilitados = Settings.Secure.getString(
      contexto.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false

    val esperado = "${contexto.packageName}/${BotonesFisicosService::class.java.name}"
    val separador = TextUtils.SimpleStringSplitter(':')
    separador.setString(habilitados)
    for (servicio in separador) {
      if (servicio.equals(esperado, ignoreCase = true)) return true
    }
    return false
  }
}
