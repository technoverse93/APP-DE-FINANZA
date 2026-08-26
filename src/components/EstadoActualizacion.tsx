import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import * as Updates from 'expo-updates';
import { Card } from './Card';
import { ListRow } from './ListRow';
import { typography, colors } from '../theme';

type Estado =
  | { tipo: 'inactivo' }
  | { tipo: 'buscando' }
  | { tipo: 'al-dia' }
  | { tipo: 'aplicando' }
  | { tipo: 'error-red' }
  | { tipo: 'error-descarga' };

const MENSAJES: Record<Estado['tipo'], string | null> = {
  inactivo: null,
  buscando: 'Buscando...',
  'al-dia': 'Ya tenés la versión más reciente.',
  aplicando: 'Se encontró una actualización nueva. Aplicándola ya mismo...',
  'error-red': 'No se pudo conectar para revisar. Probá con mejor señal.',
  'error-descarga': 'Se encontró una actualización pero no bajó completa. Probá de nuevo.',
};

/**
 * Diagnóstico de la actualización OTA, para cuando el usuario reporta ver
 * contenido viejo pese a que ya se publicó una actualización.
 *
 * Sin esto, cualquier reporte de "sigue igual" es indiagnosticable a
 * distancia: no hay forma de saber si el teléfono corre el bundle de fábrica,
 * uno viejo, o si el chequeo automático está fallando en silencio (sin red,
 * canal mal configurado, descarga cortada). Esta tarjeta expone justo esos
 * tres datos y deja forzar el chequeo a mano, en vez de depender de
 * cerrar-y-abrir la app y adivinar si alcanzó.
 */
export function EstadoActualizacion() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'inactivo' });

  const buscarAhora = useCallback(async () => {
    setEstado({ tipo: 'buscando' });
    let disponible: boolean;
    try {
      const resultado = await Updates.checkForUpdateAsync();
      disponible = resultado.isAvailable;
    } catch {
      setEstado({ tipo: 'error-red' });
      return;
    }
    if (!disponible) {
      setEstado({ tipo: 'al-dia' });
      return;
    }
    try {
      await Updates.fetchUpdateAsync();
    } catch {
      setEstado({ tipo: 'error-descarga' });
      return;
    }
    setEstado({ tipo: 'aplicando' });
    try {
      await Updates.reloadAsync();
    } catch {
      // Ya quedó descargada: si el reload falla, arranca con ella la
      // próxima vez que se abra la app de todas formas.
    }
  }, []);

  if (!Updates.isEnabled) {
    return (
      <Card>
        <Text style={styles.nota}>
          Esta versión no recibe actualizaciones automáticas (es una versión de desarrollo).
        </Text>
      </Card>
    );
  }

  const { isEmbeddedLaunch, createdAt, updateId } = Updates;
  const detalleVersion = isEmbeddedLaunch
    ? 'La que vino instalada de fábrica, sin ninguna actualización bajada todavía.'
    : createdAt
      ? `Bajada el ${createdAt.toLocaleDateString('es-CR')} a las ${createdAt.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}.`
      : 'Descargada.';

  const mensaje = MENSAJES[estado.tipo];

  return (
    <Card sinRelleno>
      <ListRow
        titulo="Versión instalada"
        detalle={detalleVersion}
        valor={updateId ? updateId.slice(0, 8) : 'De fábrica'}
      />
      <ListRow
        titulo="Buscar actualización ahora"
        detalle={mensaje ?? 'Revisa si hay una versión nueva publicada y la aplica de una vez.'}
        valor={estado.tipo === 'buscando' || estado.tipo === 'aplicando' ? undefined : 'Buscar'}
        tono={
          estado.tipo === 'error-red' || estado.tipo === 'error-descarga' ? 'negativo' : 'normal'
        }
        onPress={estado.tipo === 'buscando' || estado.tipo === 'aplicando' ? undefined : () => void buscarAhora()}
        ultima
      />
    </Card>
  );
}

const styles = {
  nota: { ...typography.subheadline, color: colors.labelSecondary },
} as const;
