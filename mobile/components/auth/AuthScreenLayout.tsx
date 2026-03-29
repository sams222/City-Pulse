import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { Brand } from '@/constants/Brand';

type Props = {
  children: ReactNode;
};

export function AuthScreenLayout({ children }: Props) {
  const colorScheme = useColorScheme();
  const isWeb = Platform.OS === 'web';

  if (!isWeb) {
    return (
      <KeyboardAvoidingView
        style={styles.fillNative}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.nativeInner}>{children}</View>
      </KeyboardAvoidingView>
    );
  }

  const bg = colorScheme === 'light' ? '#ffffff' : Brand.background;

  return (
    <KeyboardAvoidingView style={[styles.fillWeb, { backgroundColor: bg }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.webScroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.webFormWrap}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fillNative: { flex: 1 },
  nativeInner: { flex: 1, padding: 24, justifyContent: 'center' },
  fillWeb: { flex: 1, minHeight: '100%' as unknown as number },
  webScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  webFormWrap: {
    width: '100%',
    maxWidth: 420,
  },
});
