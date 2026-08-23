import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGoogleGmailAuth } from '../lib/googleAuth';
import { sincronizarGmail } from '../lib/gmailSync';
import { colors, radius, spacing, typography } from '../theme';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';

/**
 * Tarjeta opcional para leer comprobantes bancarios directo de Gmail, aparte
 * del sync por IMAP que ya corre solo cada 30 minutos. No reemplaza nada:
 * es una fuente adicional, pensada para cuando el usuario quiere forzar una
 * lectura inmediata sin esperar al próximo ciclo del cron.
 *
 * Quien la usa debe renderizarla solo si `googleAuthConfigurado` (de
 * `../lib/googleAuth`) es true, y no montarla en absoluto si no — el hook de
 * Google de abajo lanza una excepción síncrona en cuanto se llama sin sus
 * client IDs, así que la comprobación tiene que pasar ANTES de que este
 * componente exista, no adentro (acá ya sería tarde: el hook ya se llamó al
 * evaluar el cuerpo del componente).
 */
export function GmailSyncCard() {
  const [request, , promptAsync] = useGoogleGmailAuth();
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conectarYSincronizar = useCallback(async () => {
    setError(null);
    setResultado(null);
    setSincronizando(true);
    try {
      const res = await promptAsync();
      if (res.type !== 'success' || !res.authentication?.accessToken) {
        if (res.type !== 'cancel' && res.type !== 'dismiss') {
          setError('Google no devolvió un token de acceso válido.');
        }
        return;
      }
      const resumen = await sincronizarGmail(res.authentication.accessToken);
      setResultado(
        `Revisados ${resumen.mensajesVistos} · Nuevas ${resumen.insertadas} · ` +
          `Excluidas del BAC ${resumen.descartadasBac}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo sincronizar con Gmail');
    } finally {
      setSincronizando(false);
    }
  }, [promptAsync]);

  return (
    <Card>
      <Text style={styles.titulo}>Gmail</Text>
      <Text style={styles.descripcion}>
        Leé tus comprobantes bancarios directo de Gmail, sin esperar al próximo sync automático.
      </Text>
      <PrimaryButton
        titulo="Conectar y sincronizar Gmail"
        onPress={() => void conectarYSincronizar()}
        deshabilitado={!request}
        cargando={sincronizando}
      />
      {resultado ? <Text style={styles.resultado}>{resultado}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  titulo: { ...typography.headline, color: colors.label },
  descripcion: {
    ...typography.footnote,
    color: colors.labelSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  resultado: {
    ...typography.footnote,
    color: colors.label,
    backgroundColor: colors.greenSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  error: {
    ...typography.footnote,
    color: colors.red,
    marginTop: spacing.md,
  },
});
