import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';

import { AuthScreenLayout } from '@/components/auth/AuthScreenLayout';
import Colors from '@/constants/Colors';
import { Brand } from '@/constants/Brand';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuth } from '@/lib/firebase';
import { usernameToEmail } from '@/lib/authUsername';
import { createUserProfile } from '@/lib/userProfileFirestore';

export default function RegisterScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const tint = Colors[colorScheme].tint;
  const isWeb = Platform.OS === 'web';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const labelColor =
    isWeb && colorScheme === 'light'
      ? '#0a0a0a'
      : isWeb
        ? Brand.textPrimary
        : Colors[colorScheme].text;
  const inputColors = isWeb
    ? colorScheme === 'light'
      ? {
          color: '#0a0a0a',
          borderColor: '#e5e5e5',
          backgroundColor: '#fafafa',
        }
      : {
          color: Brand.textPrimary,
          borderColor: Brand.borderSubtle,
          backgroundColor: Brand.background,
        }
    : {
        color: Colors[colorScheme].text,
        borderColor: colorScheme === 'dark' ? '#475569' : '#cbd5e1',
        backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#fff',
      };

  const onRegister = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      const email = usernameToEmail(username);
      const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      await createUserProfile(cred.user.uid, username.trim().toLowerCase().replace(/\s+/g, ''));
      await refreshProfile();
      router.replace('/(auth)/preferences');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not register';
      if (msg.includes('email-already-in-use')) {
        setError('That username is already taken.');
      } else if (msg.includes('Username')) {
        setError(msg);
      } else {
        setError('Registration failed. Try a different username.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreenLayout>
      <View
        style={[
          styles.inner,
          isWeb && styles.innerWeb,
          isWeb && (colorScheme === 'light' ? styles.innerWebLight : styles.innerWebDark),
        ]}>
        <Text style={[styles.hint, { color: labelColor }]}>
          Choose a username (letters, numbers, underscore). Next you will pick interests.
        </Text>
        <Text style={[styles.label, { color: labelColor }]}>Username</Text>
        <TextInput
          style={[styles.input, inputColors]}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          placeholder="alex_nyc"
          placeholderTextColor={isWeb && colorScheme === 'light' ? '#737373' : isWeb ? Brand.textSecondary : '#94a3b8'}
        />
        <Text style={[styles.label, { color: labelColor }]}>Password</Text>
        <TextInput
          style={[styles.input, inputColors]}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          placeholderTextColor={isWeb && colorScheme === 'light' ? '#737373' : isWeb ? Brand.textSecondary : '#94a3b8'}
        />
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <Pressable
          style={[styles.btn, { backgroundColor: tint, opacity: busy ? 0.7 : 1 }]}
          onPress={() => void onRegister()}
          disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continue</Text>}
        </Pressable>
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  inner: { width: '100%' },
  innerWeb: {
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
  },
  innerWebLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e5e5',
  },
  innerWebDark: {
    backgroundColor: Brand.surface,
    borderColor: Brand.borderSubtle,
  },
  hint: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  err: { color: '#f87171', marginBottom: 12 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
