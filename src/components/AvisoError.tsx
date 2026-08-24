import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  /**
   * Errores de los distintos hooks de datos. Los `null` se descartan, así que
   * la pantalla puede pasar todos los que tenga sin condicionar cada uno.
   */
  readonly errores: readonly (string | null | undefined)[];
}

/**
 * Franja que muestra los fallos de carga o de guardado.
 *
 * Existe porque su ausencia escondió el peor error de esta app: todos los
 * hooks guardaban el fallo en un estado `error` que NINGUNA pantalla
 * renderizaba. Cuando la app no tenía sesión de Supabase, cada inserción
 * abortaba con "No hay sesión activa" y cada lectura devolvía vacío por RLS —
 * en pantalla eso se veía exactamente igual que "todavía no cargaste nada".
 * La base terminó con cero filas sin que nada lo dijera.
 *
 * Un fallo silencioso en una app de finanzas es peor que uno ruidoso: el
 * usuario cree que su gasto quedó anotado y toma decisiones con un saldo que
 * no existe.
 */
export function AvisoError({ errores }: Props) {
  const visibles = Array.from(new Set(errores.filter((e): e is string => Boolean(e))));
  if (visibles.length === 0) return null;

  return (
    <View style={styles.caja}>
      <Text style={styles.titulo}>No se pudo guardar o cargar</Text>
      {visibles.map((mensaje) => (
        <Text key={mensaje} style={styles.mensaje}>
          {mensaje}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    backgroundColor: colors.redSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  titulo: { ...typography.footnote, fontWeight: '700', color: colors.label },
  mensaje: { ...typography.footnote, color: colors.label },
});
