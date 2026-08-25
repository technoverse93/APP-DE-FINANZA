package expo.modules.entradarapida

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject

/**
 * Puente de datos entre la app de React Native y el código nativo.
 *
 * El widget y la ventana emergente corren FUERA del proceso de React Native:
 * el widget lo dibuja el lanzador de Android y la ventana la puede abrir el
 * servicio de accesibilidad con la app cerrada. Ninguno de los dos puede
 * pedirle nada a JavaScript, así que todo lo que necesitan —a qué proyecto de
 * Supabase escribir, con qué token, y cuánto remanente mostrar— tiene que
 * estar ya escrito en disco antes de que haga falta.
 *
 * Los tokens van en EncryptedSharedPreferences (llave del Android Keystore),
 * no en un SharedPreferences normal: es la misma protección que expo-secure-store
 * le da a la sesión del lado de JavaScript, y sin eso un backup del dispositivo
 * o un teléfono rooteado dejaría el token de una cuenta financiera en texto
 * plano.
 *
 * Lo que NO es secreto (el remanente que muestra el widget, si mostrarlo o no)
 * va en un SharedPreferences aparte sin cifrar: el widget lo lee en cada
 * redibujado desde el proceso del lanzador, y abrir el almacén cifrado en ese
 * camino caliente cuesta bastante más de lo que protege un número que ya está
 * a la vista en la pantalla de inicio.
 */
object PuenteDatos {

  private const val ARCHIVO_SEGURO = "entrada_rapida_seguro"
  private const val ARCHIVO_PUBLICO = "entrada_rapida_publico"

  private const val CLAVE_URL = "supabase_url"
  private const val CLAVE_ANON = "supabase_anon_key"
  private const val CLAVE_ACCESS = "access_token"
  private const val CLAVE_REFRESH = "refresh_token"
  private const val CLAVE_USUARIO = "usuario_id"

  private const val CLAVE_REMANENTE = "remanente"
  private const val CLAVE_MOSTRAR_MONTO = "mostrar_monto"
  private const val CLAVE_PENDIENTES = "pendientes"

  @Volatile
  private var seguroCache: SharedPreferences? = null

  /**
   * Abrir el almacén cifrado implica derivar la llave maestra del Keystore,
   * que es caro. Se memoiza porque la ventana emergente lo consulta en el
   * camino de guardado, donde cada milisegundo se nota.
   */
  private fun seguro(context: Context): SharedPreferences {
    seguroCache?.let { return it }
    synchronized(this) {
      seguroCache?.let { return it }
      val llave = MasterKey.Builder(context.applicationContext)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
      val prefs = EncryptedSharedPreferences.create(
        context.applicationContext,
        ARCHIVO_SEGURO,
        llave,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      )
      seguroCache = prefs
      return prefs
    }
  }

  private fun publico(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(ARCHIVO_PUBLICO, Context.MODE_PRIVATE)

  /* ---------------------------------------------------------------------- */
  /* Configuración y sesión                                                  */
  /* ---------------------------------------------------------------------- */

  fun guardarConfiguracion(context: Context, url: String, anonKey: String) {
    seguro(context).edit()
      .putString(CLAVE_URL, url)
      .putString(CLAVE_ANON, anonKey)
      .apply()
  }

  fun guardarSesion(context: Context, accessToken: String, refreshToken: String, usuarioId: String) {
    seguro(context).edit()
      .putString(CLAVE_ACCESS, accessToken)
      .putString(CLAVE_REFRESH, refreshToken)
      .putString(CLAVE_USUARIO, usuarioId)
      .apply()
  }

  /**
   * Al cerrar sesión hay que borrar el token Y el remanente: dejar el monto
   * en el widget después de salir de la cuenta mostraría el saldo de alguien
   * que ya no está autenticado.
   */
  fun limpiarSesion(context: Context) {
    seguro(context).edit()
      .remove(CLAVE_ACCESS)
      .remove(CLAVE_REFRESH)
      .remove(CLAVE_USUARIO)
      .apply()
    publico(context).edit().remove(CLAVE_REMANENTE).apply()
  }

  fun url(context: Context): String? = seguro(context).getString(CLAVE_URL, null)
  fun anonKey(context: Context): String? = seguro(context).getString(CLAVE_ANON, null)
  fun accessToken(context: Context): String? = seguro(context).getString(CLAVE_ACCESS, null)
  fun refreshToken(context: Context): String? = seguro(context).getString(CLAVE_REFRESH, null)
  fun usuarioId(context: Context): String? = seguro(context).getString(CLAVE_USUARIO, null)

  fun haySesion(context: Context): Boolean =
    !accessToken(context).isNullOrEmpty() && !usuarioId(context).isNullOrEmpty()

  fun actualizarAccessToken(context: Context, accessToken: String, refreshToken: String?) {
    val editor = seguro(context).edit().putString(CLAVE_ACCESS, accessToken)
    if (!refreshToken.isNullOrEmpty()) editor.putString(CLAVE_REFRESH, refreshToken)
    editor.apply()
  }

  /* ---------------------------------------------------------------------- */
  /* Datos que muestra el widget                                             */
  /* ---------------------------------------------------------------------- */

  fun guardarRemanente(context: Context, remanente: Double) {
    publico(context).edit().putFloat(CLAVE_REMANENTE, remanente.toFloat()).apply()
  }

  /** `null` cuando todavía no hay dato: el widget muestra un guion, no un 0. */
  fun remanente(context: Context): Double? {
    val prefs = publico(context)
    if (!prefs.contains(CLAVE_REMANENTE)) return null
    return prefs.getFloat(CLAVE_REMANENTE, 0f).toDouble()
  }

  /**
   * Un widget en la pantalla de inicio enseña el saldo a cualquiera que
   * levante el teléfono, sin pasar por la huella. Por eso se puede apagar el
   * monto y dejar solo los botones de anotar.
   */
  fun mostrarMonto(context: Context): Boolean =
    publico(context).getBoolean(CLAVE_MOSTRAR_MONTO, true)

  fun guardarMostrarMonto(context: Context, mostrar: Boolean) {
    publico(context).edit().putBoolean(CLAVE_MOSTRAR_MONTO, mostrar).apply()
  }

  /* ---------------------------------------------------------------------- */
  /* Cola de movimientos que no se pudieron enviar                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Un movimiento anotado sin red no se puede perder: el usuario ya lo dio por
   * hecho cuando la ventana se cerró. Queda en cola y se reintenta al abrir la
   * app o al anotar el siguiente.
   */
  fun encolar(context: Context, movimiento: JSONObject) {
    val prefs = publico(context)
    val cola = JSONArray(prefs.getString(CLAVE_PENDIENTES, "[]"))
    cola.put(movimiento)
    prefs.edit().putString(CLAVE_PENDIENTES, cola.toString()).apply()
  }

  fun pendientes(context: Context): JSONArray =
    JSONArray(publico(context).getString(CLAVE_PENDIENTES, "[]"))

  fun reemplazarPendientes(context: Context, cola: JSONArray) {
    publico(context).edit().putString(CLAVE_PENDIENTES, cola.toString()).apply()
  }
}
