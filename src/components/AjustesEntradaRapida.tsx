import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Switch, Text, View } from 'react-native';
import {
  abrirAjustesAccesibilidad,
  abrirAjustesSuperposicion,
  abrirVentanaPrueba,
  entradaRapidaDisponible,
  guardarMostrarMontoEnWidget,
  mostrarMontoEnWidget,
  movimientosPendientes,
  sincronizarPendientesNativos,
  tieneAccesibilidadActiva,
  tienePermisoSuperposicion,
} from '../../modules/entrada-rapida';
import { colors, radius, spacing, typography } from '../theme';
import { Card } from './Card';
import { ListRow } from './ListRow';

/**
 * Ajustes del widget y de los botones físicos.
 *
 * Los dos permisos que esto necesita —"mostrar sobre otras aplicaciones" y el
 * servicio de accesibilidad— son de concesión manual: Android no permite
 * pedirlos con un diálogo, justamente porque son poderosos. Lo único que puede
 * hacer la app es explicar para qué son y llevar a la pantalla correcta de
 * Ajustes, que es lo que hace esta tarjeta.
 *
 * El estado se recarga cuando la app vuelve al frente porque el usuario los
 * concede FUERA de la app: sin eso, al volver de Ajustes esto seguiría
 * mostrando "falta conceder" hasta reiniciar.
 */
export function AjustesEntradaRapida() {
  const [superposicion, setSuperposicion] = useState(false);
  const [accesibilidad, setAccesibilidad] = useState(false);
  const [mostrarMonto, setMostrarMonto] = useState(true);
  const [pendientes, setPendientes] = useState(0);

  const releer = useCallback(() => {
    if (!entradaRapidaDisponible) return;
    setSuperposicion(tienePermisoSuperposicion());
    setAccesibilidad(tieneAccesibilidadActiva());
    setMostrarMonto(mostrarMontoEnWidget());
    setPendientes(movimientosPendientes());
  }, []);

  useEffect(() => {
    releer();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') releer();
    });
    return () => sub.remove();
  }, [releer]);

  const alternarMonto = useCallback((valor: boolean) => {
    setMostrarMonto(valor);
    guardarMostrarMontoEnWidget(valor);
  }, []);

  const subirPendientes = useCallback(() => {
    void sincronizarPendientesNativos().then(() => setPendientes(movimientosPendientes()));
  }, []);

  if (!entradaRapidaDisponible) {
    return (
      <Card>
        <Text style={styles.nota}>
          El widget y los botones físicos solo existen en la app instalada de Android.
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.contenedor}>
      <Card sinRelleno>
        <ListRow
          titulo="Mostrar sobre otras apps"
          detalle={
            superposicion
              ? 'Concedido. La ventana puede abrirse encima de cualquier pantalla.'
              : 'Falta conceder. Sin esto los botones físicos no pueden abrir la ventana. Tocá para ir a Ajustes.'
          }
          valor={superposicion ? 'Listo' : 'Conceder'}
          tono={superposicion ? 'positivo' : 'atencion'}
          onPress={superposicion ? undefined : abrirAjustesSuperposicion}
        />
        <ListRow
          titulo="Botones físicos"
          detalle={
            accesibilidad
              ? 'Activo. Doble pulsación de volumen abajo abre la ventana.'
              : 'Falta activar en Ajustes → Accesibilidad → Finanzas · Botones físicos. Tocá para ir.'
          }
          valor={accesibilidad ? 'Activo' : 'Activar'}
          tono={accesibilidad ? 'positivo' : 'atencion'}
          onPress={accesibilidad ? undefined : abrirAjustesAccesibilidad}
        />
        <ListRow
          titulo="Probar la ventana"
          detalle="Abre la misma ventana que sale con los botones físicos."
          valor="Abrir"
          onPress={abrirVentanaPrueba}
          ultima={pendientes === 0}
        />
        {pendientes > 0 ? (
          <ListRow
            titulo="Movimientos sin subir"
            detalle="Se anotaron sin red desde el widget. Tocá para subirlos ahora."
            valor={String(pendientes)}
            tono="atencion"
            onPress={subirPendientes}
            ultima
          />
        ) : null}
      </Card>

      <Card>
        <View style={styles.filaSwitch}>
          <View style={styles.textoSwitch}>
            <Text style={styles.etiqueta}>Mostrar el monto en el widget</Text>
            <Text style={styles.ayuda}>
              {mostrarMonto
                ? 'Cualquiera que levante el teléfono ve tu remanente sin pasar por la huella.'
                : 'El widget oculta la cifra y deja solo los botones de anotar.'}
            </Text>
          </View>
          <Switch
            value={mostrarMonto}
            onValueChange={alternarMonto}
            trackColor={{ true: colors.acento, false: colors.fill }}
            thumbColor={colors.label}
          />
        </View>
      </Card>

      <Text style={styles.advertencia}>
        Anotar desde el widget o con los botones físicos no pide la huella — ese es justamente el
        punto. Para que funcione con la app cerrada, tu sesión queda guardada cifrada en el
        teléfono. Solo permite anotar movimientos: no muestra saldos ni deja borrar nada.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { gap: spacing.sm },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  textoSwitch: { flex: 1, gap: 2 },
  etiqueta: { ...typography.footnote, color: colors.labelSecondary },
  ayuda: { ...typography.caption1, color: colors.labelTertiary },
  nota: { ...typography.subheadline, color: colors.labelSecondary },
  advertencia: {
    ...typography.caption1,
    color: colors.label,
    backgroundColor: colors.orangeSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
