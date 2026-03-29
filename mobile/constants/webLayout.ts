import { Platform, type ViewStyle } from 'react-native';

/** Max readable width for primary content on large web viewports. */
export const WEB_MAX_CONTENT_WIDTH = 720;

/** Outer wrapper: centers children on web. */
export const webScreenOuter: ViewStyle =
  Platform.OS === 'web'
    ? { flex: 1, width: '100%', alignItems: 'center' }
    : { flex: 1 };

/** Inner column: constrains width on web, full width on native. */
export const webScreenInner: ViewStyle =
  Platform.OS === 'web'
    ? { flex: 1, width: '100%', maxWidth: WEB_MAX_CONTENT_WIDTH, minHeight: 0 }
    : { flex: 1, minHeight: 0 };
