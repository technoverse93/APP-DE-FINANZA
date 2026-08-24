import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton } from '../components';
import { supabase } from '../lib/supabase';
import { campoTexto, colors, radius, spacing, typography } from '../theme';

type Modo = 'entrar' | 'crear';

/**
 * Inicio de sesión de Supabase.
 *
 * Es lo que faltaba para que la app pudiera guardar algo: todos los hooks
 * identifican al dueño de cada fila con `auth.getUser()`, y las políticas RLS
 * filtran por `auth.uid()`. Sin sesión, cada inserción abortaba y cada
 * lectura devolvía vacío.
 *
 * Se usa correo + contraseña y no un enlace mágico a propósito: el enlace
 * obliga a salir de la app, abrir el correo y volver, y acá el correo del
 * usuario ya lo lee la propia app — un flujo circular molesto en un
 * teléfono. Con contraseña se entra una sola vez y la sesión queda guardada
 * cifrada en el Keystore del sistema.
 */
export function AuthScreen() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const enviar = useCallback(async () => {
    const correoLimpio = correo.trim().toLowerCase();
    if (!correoLimpio || clave.length < 6) {
      setError('Escribí tu correo y una contraseña de al menos 6 caracteres.');
      return;
    }

    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      if (modo === 'crear') {
        const { data, error: e } = await supabase.auth.signUp({
          email: correoLimpio,
          password: clave,
        });
        if (e) throw e;
        // Si el proyecto exige confirmar el correo, signUp devuelve usuario
        // pero sin sesión: hay que avisarlo en vez de dejar la pantalla
        // quieta como si no hubiera pasado nada.
        if (!data.session) {
          setAviso('Cuenta creada. Revisá tu correo para confirmarla y después iniciá sesión.');
          setModo('entrar');
        }
        return;
      }

      const { error: e } = await supabase.auth.signInWithPassword({
        email: correoLimpio,
        password: clave,
      });
      if (e) throw e;
      // No hace falta navegar: useSesion escucha onAuthStateChange y App
      // reemplaza esta pantalla por la app en cuanto la sesión existe.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la operación');
    } finally {
      setOcupado(false);
    }
  }, [modo, correo, clave]);

  return (
    <SafeAreaView style={styles.pantalla}>
      <KeyboardAvoidingView
        style={styles.flexible}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.contenido}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.titulo}>Finanzas</Text>
          <Text style={styles.subtitulo}>
            {modo === 'entrar'
              ? 'Entrá con tu cuenta para que tus datos se guarden.'
              : 'Creá tu cuenta para empezar a guardar tus datos.'}
          </Text>

          <Card>
            <View style={styles.formulario}>
              <Text style={styles.etiqueta}>Correo</Text>
              <TextInput
                style={styles.input}
                value={correo}
                onChangeText={setCorreo}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="tucorreo@gmail.com"
                placeholderTextColor={colors.labelTertiary}
              />

              <Text style={styles.etiqueta}>Contraseña</Text>
              <TextInput
                style={styles.input}
                value={clave}
                onChangeText={setClave}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                placeholder="Al menos 6 caracteres"
                placeholderTextColor={colors.labelTertiary}
              />

              <PrimaryButton
                titulo={modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
                onPress={() => void enviar()}
                cargando={ocupado}
              />

              {ocupado ? <ActivityIndicator color={colors.acento} /> : null}
              {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </Card>

          <Text
            style={styles.alternar}
            onPress={() => {
              setModo(modo === 'entrar' ? 'crear' : 'entrar');
              setError(null);
              setAviso(null);
            }}
          >
            {modo === 'entrar'
              ? '¿Todavía no tenés cuenta? Creá una'
              : '¿Ya tenés cuenta? Entrá'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  flexible: { flex: 1 },
  contenido: {
    padding: spacing.lg,
    gap: spacing.lg,
    flexGrow: 1,
    justifyContent: 'center',
  },
  titulo: { ...typography.largeTitle, color: colors.label, textAlign: 'center' },
  subtitulo: {
    ...typography.subheadline,
    color: colors.labelSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  formulario: { gap: spacing.md },
  etiqueta: { ...typography.footnote, color: colors.labelSecondary },
  input: {
    ...campoTexto,
  },
  aviso: {
    ...typography.footnote,
    color: colors.label,
    backgroundColor: colors.greenSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  error: { ...typography.footnote, color: colors.red },
  alternar: {
    ...typography.subheadline,
    color: colors.acento,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
