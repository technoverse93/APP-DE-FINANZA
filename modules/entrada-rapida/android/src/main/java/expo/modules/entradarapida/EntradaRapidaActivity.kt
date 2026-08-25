package expo.modules.entradarapida

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import java.util.concurrent.Executors

/**
 * Ventana emergente de entrada rápida.
 *
 * Es una Activity translúcida, no una ventana de superposición con
 * SYSTEM_ALERT_WINDOW. La diferencia importa: una superposición no recibe foco
 * de teclado de forma fiable, y acá hace falta escribir un monto. El permiso
 * de superposición se pide igual, pero para otra cosa — es lo que le permite
 * al servicio de accesibilidad ABRIR esta Activity con la app en segundo
 * plano, que Android bloquea desde la versión 10.
 *
 * Guarda de forma optimista: cierra apenas se toca el botón y la escritura
 * viaja en un hilo aparte. Si no hay red, el movimiento queda en cola local y
 * se reintenta solo. Esperar la respuesta del servidor con la ventana abierta
 * arruinaría justamente lo que la hace útil.
 */
class EntradaRapidaActivity : Activity() {

  private val ejecutor = Executors.newSingleThreadExecutor()
  private var tipo = "gasto"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Sin esto la ventana no levanta el teclado sola y hay que tocar el campo.
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
    setContentView(R.layout.activity_entrada_rapida)

    tipo = intent?.getStringExtra(EXTRA_TIPO) ?: "gasto"

    val campoMonto = findViewById<EditText>(R.id.campo_monto)
    val botonGasto = findViewById<Button>(R.id.boton_tipo_gasto)
    val botonIngreso = findViewById<Button>(R.id.boton_tipo_ingreso)
    val botonGuardar = findViewById<Button>(R.id.boton_guardar)
    val botonCancelar = findViewById<TextView>(R.id.boton_cancelar)
    val aviso = findViewById<TextView>(R.id.aviso)

    // Sin sesión no hay a nombre de quién insertar la fila: las políticas RLS
    // la rechazarían igual, así que es mejor decirlo antes de teclear nada.
    if (!PuenteDatos.haySesion(this)) {
      aviso.text = getString(R.string.entrada_sin_sesion)
      aviso.visibility = View.VISIBLE
      botonGuardar.isEnabled = false
    }

    fun pintarTipo() {
      botonGasto.isSelected = tipo == "gasto"
      botonIngreso.isSelected = tipo == "ingreso"
    }
    pintarTipo()

    botonGasto.setOnClickListener { tipo = "gasto"; pintarTipo() }
    botonIngreso.setOnClickListener { tipo = "ingreso"; pintarTipo() }
    botonCancelar.setOnClickListener { finish() }

    botonGuardar.setOnClickListener {
      val monto = campoMonto.text.toString().filter { it.isDigit() }.toLongOrNull() ?: 0L
      if (monto <= 0L) {
        aviso.text = getString(R.string.entrada_monto_invalido)
        aviso.visibility = View.VISIBLE
        return@setOnClickListener
      }
      guardar(monto)
    }

    campoMonto.requestFocus()
  }

  private fun guardar(monto: Long) {
    val tipoElegido = tipo
    val contexto = applicationContext
    val etiqueta = if (tipoElegido == "gasto") "Gasto hormiga" else "Ingreso extra"

    ejecutor.execute {
      val resultado = RepositorioMovimientos.anotar(
        contexto,
        tipoElegido,
        monto,
        "",
        etiqueta
      )
      // El widget muestra cuántos movimientos quedaron sin enviar, así que hay
      // que repintarlo tanto si se envió como si quedó en cola.
      WidgetFinanzas.refrescarTodos(contexto)

      // Los textos se piden al contexto de aplicación, no al de la Activity:
      // para cuando esto corre, la ventana ya se cerró con finish() y usar su
      // contexto sería tocar una Activity destruida.
      val mensaje = when (resultado) {
        RepositorioMovimientos.Resultado.Enviado ->
          contexto.getString(
            R.string.entrada_guardada,
            WidgetFinanzas.formatearColones(monto.toDouble())
          )
        RepositorioMovimientos.Resultado.Encolado -> contexto.getString(R.string.entrada_encolada)
        RepositorioMovimientos.Resultado.SinSesion -> contexto.getString(R.string.entrada_sin_sesion)
      }
      Handler(Looper.getMainLooper()).post {
        Toast.makeText(contexto, mensaje, Toast.LENGTH_SHORT).show()
      }
    }

    // Cierre inmediato: la confirmación llega por Toast, que se ve igual
    // aunque la ventana ya no esté.
    finish()
  }

  override fun onDestroy() {
    super.onDestroy()
    ejecutor.shutdown()
  }

  companion object {
    const val EXTRA_TIPO = "tipo"
  }
}
