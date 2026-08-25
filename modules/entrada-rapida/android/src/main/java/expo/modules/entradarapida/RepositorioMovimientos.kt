package expo.modules.entradarapida

import android.content.Context
import android.util.Log
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/**
 * Escritura de movimientos a Supabase desde código nativo.
 *
 * No usa el cliente de Supabase de JavaScript porque acá no hay JavaScript:
 * la ventana emergente puede abrirse con la app cerrada. Habla directo con
 * PostgREST por HTTP, que es lo mismo que hace el cliente de JS por debajo.
 *
 * Se usa HttpURLConnection y no OkHttp a propósito: OkHttp entra al APK por
 * React Native, pero depender acá de una biblioteca que llega de forma
 * transitiva ataría este módulo a una versión que otro paquete decide. La
 * clase del JDK no tiene ese problema y para dos peticiones sobra.
 *
 * Las políticas RLS de la tabla filtran por `auth.uid()`, así que este token
 * solo puede escribir filas del propio usuario: aunque se filtrara, no da
 * acceso a datos de nadie más.
 */
object RepositorioMovimientos {

  private const val TAG = "EntradaRapida"
  private const val TIMEOUT_MS = 12_000

  sealed class Resultado {
    object Enviado : Resultado()
    /** Guardado en cola local: se reintenta después. */
    object Encolado : Resultado()
    object SinSesion : Resultado()
  }

  /**
   * Anota un movimiento. Nunca lanza: desde la ventana emergente no hay dónde
   * mostrar una traza, y perder el gasto por un error de red sería peor que
   * dejarlo en cola.
   */
  fun anotar(
    context: Context,
    tipo: String,
    monto: Long,
    descripcion: String,
    categoria: String
  ): Resultado {
    if (!PuenteDatos.haySesion(context)) return Resultado.SinSesion

    val fila = JSONObject().apply {
      put("usuario_id", PuenteDatos.usuarioId(context))
      put("tipo", tipo)
      put("monto", monto)
      put("descripcion", descripcion)
      put("categoria", categoria)
    }

    return if (enviarFila(context, fila)) {
      // Aprovecha la conexión abierta para vaciar lo que hubiera quedado
      // pendiente de un intento anterior sin red.
      sincronizarPendientes(context)
      Resultado.Enviado
    } else {
      PuenteDatos.encolar(context, fila)
      Resultado.Encolado
    }
  }

  /**
   * Reintenta la cola. Devuelve cuántas filas se lograron enviar.
   *
   * Se detiene en el primer fallo en vez de seguir con las demás: si una no
   * pasa por falta de red, las siguientes tampoco van a pasar, y seguir
   * intentando solo agrega demora.
   */
  fun sincronizarPendientes(context: Context): Int {
    val cola = PuenteDatos.pendientes(context)
    if (cola.length() == 0) return 0

    var enviadas = 0
    var seCorto = false
    val quedan = JSONArray()
    for (i in 0 until cola.length()) {
      val fila = cola.optJSONObject(i) ?: continue
      if (seCorto) {
        quedan.put(fila)
        continue
      }
      if (enviarFila(context, fila)) {
        enviadas++
      } else {
        seCorto = true
        quedan.put(fila)
      }
    }
    PuenteDatos.reemplazarPendientes(context, quedan)
    return enviadas
  }

  /**
   * Un intento de inserción, con un reintento si el token venció.
   *
   * Los access token de Supabase duran una hora. El widget puede pasar días
   * sin que se abra la app, así que encontrarse un 401 es lo normal, no la
   * excepción: sin el refresco de acá, la entrada rápida dejaría de funcionar
   * a la hora de haber abierto la app por última vez.
   */
  private fun enviarFila(context: Context, fila: JSONObject): Boolean {
    val codigo = intentarInsertar(context, fila)
    if (codigo in 200..299) return true
    if (codigo != 401) return false

    if (!refrescarSesion(context)) return false
    return intentarInsertar(context, fila) in 200..299
  }

  /** Código HTTP devuelto, o -1 si ni siquiera se pudo conectar. */
  private fun intentarInsertar(context: Context, fila: JSONObject): Int {
    val base = PuenteDatos.url(context) ?: return -1
    val anon = PuenteDatos.anonKey(context) ?: return -1
    val token = PuenteDatos.accessToken(context) ?: return -1

    return try {
      val conexion = (URL("$base/rest/v1/libro_mayor").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        doOutput = true
        setRequestProperty("apikey", anon)
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Content-Type", "application/json")
        // Sin esto PostgREST devuelve la fila insertada, que acá no se usa.
        setRequestProperty("Prefer", "return=minimal")
      }
      conexion.outputStream.use { it.write(fila.toString().toByteArray()) }
      val codigo = conexion.responseCode
      if (codigo !in 200..299) {
        Log.w(TAG, "Insercion rechazada ($codigo): ${leerError(conexion)}")
      }
      conexion.disconnect()
      codigo
    } catch (e: Exception) {
      Log.w(TAG, "Sin conexion al insertar: ${e.message}")
      -1
    }
  }

  /** Canjea el refresh token por uno nuevo y lo persiste. */
  private fun refrescarSesion(context: Context): Boolean {
    val base = PuenteDatos.url(context) ?: return false
    val anon = PuenteDatos.anonKey(context) ?: return false
    val refresh = PuenteDatos.refreshToken(context) ?: return false

    return try {
      val conexion = (URL("$base/auth/v1/token?grant_type=refresh_token")
        .openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        doOutput = true
        setRequestProperty("apikey", anon)
        setRequestProperty("Content-Type", "application/json")
      }
      val cuerpo = JSONObject().put("refresh_token", refresh)
      conexion.outputStream.use { it.write(cuerpo.toString().toByteArray()) }

      if (conexion.responseCode !in 200..299) {
        Log.w(TAG, "No se pudo refrescar la sesion (${conexion.responseCode})")
        conexion.disconnect()
        return false
      }

      val respuesta = JSONObject(
        conexion.inputStream.bufferedReader().use(BufferedReader::readText)
      )
      conexion.disconnect()

      val nuevoAccess = respuesta.optString("access_token")
      if (nuevoAccess.isNullOrEmpty()) return false
      PuenteDatos.actualizarAccessToken(
        context,
        nuevoAccess,
        respuesta.optString("refresh_token").takeIf { it.isNotEmpty() }
      )
      true
    } catch (e: Exception) {
      Log.w(TAG, "Fallo al refrescar la sesion: ${e.message}")
      false
    }
  }

  private fun leerError(conexion: HttpURLConnection): String =
    try {
      conexion.errorStream?.bufferedReader()?.use(BufferedReader::readText) ?: ""
    } catch (e: Exception) {
      ""
    }
}
