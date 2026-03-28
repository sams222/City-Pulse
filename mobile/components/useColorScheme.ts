import { useColorScheme as useColorSchemeCore } from 'react-native';

export function useColorScheme(): 'light' | 'dark' {
  const scheme = useColorSchemeCore();
  return scheme === 'dark' ? 'dark' : 'light';
}
