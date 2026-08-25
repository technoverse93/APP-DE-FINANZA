package expo.modules.entradarapida

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.SystemClock
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent

/**
 * Detección de los botones físicos de volumen.
 *
 * Un servicio de accesibilidad es el ÚNICO camino en Android para leer teclas
 * físicas con la app cerrada: cualquier otra vía (un Service normal, un
 * BroadcastReceiver) no recibe eventos de teclado del sistema. Por eso hay que
 * habilitarlo a mano en Ajustes → Accesibilidad; ninguna app puede
 * concedérselo sola, y es correcto que sea así.
 *
 * El gesto es doble pulsación de VOLUMEN ABAJO. La primera pulsación se deja
 * pasar (el volumen baja de verdad); solo la segunda dentro de la ventana se
 * consume, para que el sistema no la procese además de abrir la ventana. Ese
 * medio escalón de volumen es el precio de no romper el botón para todo lo
 * demás: consumir siempre la primera dejaría el teléfono sin poder bajar el
 * volumen nunca.
 */
class BotonesFisicosService : AccessibilityService() {

  private var ultimaPulsacion = 0L

  override fun onKeyEvent(event: KeyEvent): Boolean {
    if (event.action != KeyEvent.ACTION_DOWN) return false
    if (event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) return false

    val ahora = SystemClock.elapsedRealtime()
    val delta = ahora - ultimaPulsacion

    // Un intervalo mínimo descarta el autorepeat de mantener el botón
    // apretado, que si no dispararía la ventana sin que nadie la pidiera.
    if (delta in INTERVALO_MINIMO_MS..VENTANA_DOBLE_MS) {
      ultimaPulsacion = 0L
      abrirEntradaRapida()
      return true
    }

    ultimaPulsacion = ahora
    return false
  }

  private fun abrirEntradaRapida() {
    val intent = Intent(this, EntradaRapidaActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    startActivity(intent)
  }

  // Requeridos por la clase base. Este servicio no observa la interfaz de
  // ninguna app: solo escucha teclas, así que no hay nada que hacer acá.
  override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

  override fun onInterrupt() = Unit

  companion object {
    private const val VENTANA_DOBLE_MS = 600L
    private const val INTERVALO_MINIMO_MS = 60L
  }
}
