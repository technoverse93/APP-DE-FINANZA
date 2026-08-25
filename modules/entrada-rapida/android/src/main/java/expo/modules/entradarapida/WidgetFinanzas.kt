package expo.modules.entradarapida

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Widget de pantalla de inicio.
 *
 * Muestra el remanente libre de la quincena y da dos botones para anotar sin
 * abrir la app. Los botones NO guardan desde el widget directamente: un
 * RemoteViews no admite campos de texto, así que no hay forma de teclear un
 * monto ahí. Lo que hacen es abrir la ventana emergente ya puesta en "gasto" o
 * en "ingreso", que es un toque menos que abrirla en blanco.
 *
 * El dato que muestra lo dejó escrito la app en `PuenteDatos`; el widget nunca
 * consulta la red. Eso es deliberado: el lanzador redibuja los widgets cuando
 * quiere, y hacer una petición HTTP en ese camino gastaría batería y datos sin
 * que nadie lo haya pedido.
 */
class WidgetFinanzas : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, construirVistas(context))
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    // La app avisa por este broadcast cuando el remanente cambió, para que el
    // widget no quede mostrando una cifra vieja hasta el próximo redibujado
    // que decida el lanzador (que puede tardar media hora).
    if (intent.action == ACCION_ACTUALIZAR) {
      refrescarTodos(context)
    }
  }

  companion object {
    const val ACCION_ACTUALIZAR = "expo.modules.entradarapida.ACTUALIZAR_WIDGET"

    fun refrescarTodos(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, WidgetFinanzas::class.java))
      if (ids.isEmpty()) return
      val vistas = construirVistas(context)
      for (id in ids) manager.updateAppWidget(id, vistas)
    }

    private fun construirVistas(context: Context): RemoteViews {
      val vistas = RemoteViews(context.packageName, R.layout.widget_finanzas)

      val haySesion = PuenteDatos.haySesion(context)
      val remanente = PuenteDatos.remanente(context)

      val texto = when {
        !haySesion -> "Abrí la app"
        !PuenteDatos.mostrarMonto(context) -> "•  •  •"
        remanente == null -> "—"
        else -> formatearColones(remanente)
      }
      vistas.setTextViewText(R.id.widget_monto, texto)

      val pendientes = PuenteDatos.pendientes(context).length()
      vistas.setTextViewText(
        R.id.widget_estado,
        when {
          !haySesion -> "Sin sesión"
          pendientes > 0 -> "$pendientes sin enviar"
          else -> "Remanente libre"
        }
      )

      vistas.setOnClickPendingIntent(R.id.widget_boton_gasto, intentEntrada(context, "gasto"))
      vistas.setOnClickPendingIntent(R.id.widget_boton_ingreso, intentEntrada(context, "ingreso"))
      vistas.setOnClickPendingIntent(R.id.widget_cabecera, intentAbrirApp(context))

      return vistas
    }

    /**
     * Cada tipo necesita su propio requestCode: con el mismo, Android reusa el
     * PendingIntent existente y los dos botones terminarían abriendo la ventana
     * en el tipo que se registró primero.
     */
    private fun intentEntrada(context: Context, tipo: String): PendingIntent {
      // Solo NEW_TASK: la ventana ya vive en su propia tarea (taskAffinity
      // vacío en el manifiesto). Agregar CLEAR_TASK acá vaciaría esa tarea
      // ajena y, cuando la app está abierta, se llevaría puesta su pila.
      val intent = Intent(context, EntradaRapidaActivity::class.java).apply {
        putExtra(EntradaRapidaActivity.EXTRA_TIPO, tipo)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(
        context,
        if (tipo == "gasto") 1 else 2,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    private fun intentAbrirApp(context: Context): PendingIntent {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent()
      return PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    /**
     * Mismo formato que `formatearColones` de JavaScript (₡1,234,567), para
     * que el widget y la app no muestren el mismo número escrito distinto.
     */
    fun formatearColones(monto: Double): String {
      val redondeado = monto.roundToLong()
      val signo = if (redondeado < 0) "-" else ""
      val digitos = abs(redondeado).toString()
      val conSeparadores = StringBuilder()
      for ((indice, caracter) in digitos.withIndex()) {
        if (indice > 0 && (digitos.length - indice) % 3 == 0) conSeparadores.append(',')
        conSeparadores.append(caracter)
      }
      return "$signo₡$conSeparadores"
    }
  }
}
