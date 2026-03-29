import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Dimensions, Platform, StyleSheet, Text, View } from 'react-native';

export const CAT_COLOR = {
  safety: '#F43F5E',
  community: '#22C55E',
  bathroom: '#3B82F6',
  user: '#A855F7',
  live: '#F97316',
} as const;

export type MarkerType = 'safety' | 'community' | 'bathroom' | 'user';

export type MapMarkerData = {
  id: string;
  type: MarkerType;
  /** Emoji shown inside the badge when zoomed in */
  icon: string;
  label: string;
  time: string;
  latitude: number;
  longitude: number;
  live?: boolean;
  /** Stacking order — higher values render on top of lower ones. */
  zIndex?: number;
};

export type MapCanvasProps = {
  markers: MapMarkerData[];
};

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export { CARTO_DARK };

// ── Responsive sizing ─────────────────────────────────────────────────────────
// Reference phone width 390 px (iPhone 14 Pro). Clamp between 0.75× and 1.55×.
const { width: WIN_W, height: WIN_H } = Dimensions.get('window');
const SCALE = Math.max(0.75, Math.min(Math.min(WIN_W, WIN_H) / 390, 1.55));

const SZ = {
  hit: Math.round(28 * SCALE),
  badge: Math.round(22 * SCALE),
  badgeBorder: Math.max(1, Math.round(2 * SCALE)),
  emoji: Math.round(11 * SCALE),
  dot: Math.round(13 * SCALE),
  pulse: Math.round(32 * SCALE),
  pulseBorder: 1.5,
};

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── Shared pin geometry ───────────────────────────────────────────────────────

/**
 * Classic teardrop location pin (sharp corner points down).
 *
 * Shape: S×S square, borderBottomRightRadius=0, all others = S/2.
 * Rotation: rotate(-45deg) → the bottom-right corner ends up straight down.
 *
 * Container height = S × (0.5 + 1/√2) ≈ S × 1.207 so that the tip lands
 * exactly on the container's bottom edge.  This means:
 *   • native: anchor={{ x: 0.5, y: 1 }}
 *   • web:    iconAnchor = [S/2, containerH]
 */
const USER_PIN_S = Math.round(20 * SCALE);
const USER_PIN_H = Math.round(USER_PIN_S * (0.5 + 1 / Math.SQRT2)); // ≈ S × 1.207
const USER_PIN_INNER = Math.round(7 * SCALE);

// ── Native marker component ───────────────────────────────────────────────────

/**
 * Native map pin.
 *
 * Zoomed in  → dark-fill circle · colored ring · emoji icon
 * Zoomed out → solid colored dot, no icon
 *
 * Cross-fades between modes (350 ms).
 * Scales "true to map zoom" via `zoomScaleAnim` — a shared Animated.Value
 * driven by MapCanvas.native.tsx on every region-change frame.
 */
export function MinimalistMapMarker({
  marker,
  zoomedOut = false,
  zoomScaleAnim,
}: {
  marker: MapMarkerData;
  zoomedOut?: boolean;
  /** Shared Animated.Value so all markers scale together without re-renders. */
  zoomScaleAnim?: Animated.Value;
}) {
  const fill = CAT_COLOR[marker.type];

  // 0 = icon mode, 1 = dot mode
  const modeFade = useRef(new Animated.Value(zoomedOut ? 1 : 0)).current;

  // Pulse ring for live events
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOp = useRef(new Animated.Value(0.5)).current;

  // Animate mode transition
  useEffect(() => {
    Animated.timing(modeFade, {
      toValue: zoomedOut ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [zoomedOut, modeFade]);

  // Pulse ring animation (only in icon mode)
  useEffect(() => {
    pulseScale.setValue(1);
    pulseOp.setValue(0.5);
    if (!marker.live) return;

    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOp, { toValue: 0.08, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseOp, { toValue: 0.52, duration: 1200, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [marker.live, pulseScale, pulseOp]);

  // iconFade: 1 when icon, 0 when dot
  const iconFade = modeFade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  // dotFade: 0 when icon, 1 when dot
  const dotFade = modeFade;

  const glowColor = marker.live ? CAT_COLOR.live : fill;
  const shadowBadge = Platform.select({
    web: { boxShadow: `0 0 12px 3px ${hexToRgba(glowColor, 0.55)}, 0 4px 10px rgba(0,0,0,0.6)` },
    default: { shadowColor: glowColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 8, elevation: 10 },
  });
  const shadowDot = Platform.select({
    web: { boxShadow: `0 0 8px 2px ${hexToRgba(fill, 0.5)}, 0 2px 6px rgba(0,0,0,0.55)` },
    default: { shadowColor: fill, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.65, shadowRadius: 6, elevation: 8 },
  });

  // Spring from 0→1 on mount so markers pop in when first added to the map
  const mountAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(mountAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 90,
      friction: 7,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        markerStyles.hit,
        {
          opacity: mountAnim,
          transform: [
            ...(zoomScaleAnim ? [{ scale: zoomScaleAnim }] : []),
            { scale: mountAnim },
          ],
        },
      ]}
      pointerEvents="none">

      {/* ── Dot layer (underneath, fades in) ─────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, markerStyles.center, { opacity: dotFade }]}>
        <View style={[markerStyles.dot, { backgroundColor: fill }, shadowDot]} />
      </Animated.View>

      {/* ── Icon layer (on top, fades out) ───────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, markerStyles.center, { opacity: iconFade }]}>
        {/* Live pulse ring */}
        {marker.live && (
          <Animated.View
            style={[
              markerStyles.pulseRing,
              { borderColor: CAT_COLOR.live, opacity: pulseOp, transform: [{ scale: pulseScale }] },
            ]}
          />
        )}
        <View
          style={[
            markerStyles.badge,
            { backgroundColor: 'rgba(12,12,14,0.93)', borderColor: fill, borderWidth: SZ.badgeBorder },
            shadowBadge,
          ]}>
          <Text style={markerStyles.emoji} allowFontScaling={false}>
            {marker.icon}
          </Text>
        </View>
      </Animated.View>

    </Animated.View>
  );
}

/**
 * Classic teardrop location pin for the hardcoded user marker.
 * Always shows as an icon-mode pin — no dot/icon cross-fade needed.
 */
export function UserMapMarker({ zoomScaleAnim }: { zoomScaleAnim?: Animated.Value }) {
  const color = CAT_COLOR.user;
  const S = USER_PIN_S;
  const inner = USER_PIN_INNER;

  const shadow = Platform.select({
    web: { boxShadow: `0 0 14px 4px ${hexToRgba(color, 0.65)}, 0 4px 10px rgba(0,0,0,0.6)` },
    default: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.75,
      shadowRadius: 10,
      elevation: 14,
    },
  });

  return (
    <Animated.View
      style={[
        userPinStyles.container,
        zoomScaleAnim ? { transform: [{ scale: zoomScaleAnim }] } : null,
      ]}
      pointerEvents="none">
      <View style={[userPinStyles.head, { backgroundColor: color }, shadow]}>
        <View style={[userPinStyles.hole, { width: inner, height: inner, borderRadius: inner / 2 }]} />
      </View>
    </Animated.View>
  );
}

const userPinStyles = StyleSheet.create({
  container: {
    width: USER_PIN_S,
    height: USER_PIN_H,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  head: {
    width: USER_PIN_S,
    height: USER_PIN_S,
    borderTopLeftRadius: USER_PIN_S / 2,
    borderTopRightRadius: USER_PIN_S / 2,
    borderBottomLeftRadius: USER_PIN_S / 2,
    borderBottomRightRadius: 0,
    // rotate(45deg) places the zero-radius corner straight down
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  hole: {
    // Dark = looks transparent/punched-through against the purple body
    backgroundColor: 'rgba(12,12,14,0.82)',
    // counter-rotate so the circle stays geometrically circular
    transform: [{ rotate: '-45deg' }],
  },
});

// ── Zoom-scale formula (shared) ───────────────────────────────────────────────

/**
 * Converts a latitudeDelta (react-native-maps Region) to a visual scale factor.
 *
 * BASE_DELTA ≈ zoom 13 (our initial region).  The exponent 0.55 means the pin
 * roughly doubles in size for every ~1.8 zoom levels zoomed in.
 * Clamped to [0.18, 2.8] so pins never disappear or become absurdly large.
 */
export const BASE_DELTA = 0.055;
export function deltaToScale(latitudeDelta: number): number {
  // Capped at 1.0 — pins never grow larger than baseline (zoom 13).
  // They only shrink as the user zooms out.
  return Math.max(0.18, Math.min(1.0, Math.pow(BASE_DELTA / latitudeDelta, 0.55)));
}

/**
 * Same curve driven by a Leaflet integer zoom level.
 * zoom 13 → 1.0, zoom 11 → ~0.47, zoom 9 → ~0.22
 */
export function zoomLevelToScale(zoom: number): number {
  return Math.max(0.18, Math.min(1.0, Math.pow(2, (zoom - 13) * 0.55)));
}

// ── Leaflet HTML generator ────────────────────────────────────────────────────

/**
 * Returns divIcon HTML containing both a `.cp-icon-layer` and a `.cp-dot-layer`.
 * Visibility is controlled by toggling `.cp-mode-icon` / `.cp-mode-dot` on `.cp-pin`.
 *
 * Pass `webScale` to size the marker responsively on web.
 */
export function leafletMarkerHtml(marker: MapMarkerData, webScale = 1): string {
  const fill = CAT_COLOR[marker.type];
  const glowColor = marker.live ? CAT_COLOR.live : fill;
  const glow = hexToRgba(glowColor, 0.52);
  const dotGlow = hexToRgba(fill, 0.5);

  const badgePx = Math.round(22 * webScale);
  const dotPx = Math.round(13 * webScale);
  const emojiFontPx = Math.round(11 * webScale);
  const pulsePx = Math.round(32 * webScale);
  const borderPx = Math.max(1, Math.round(2 * webScale));

  const pulseHtml = marker.live
    ? `<span class="cp-pulse" style="width:${pulsePx}px;height:${pulsePx}px;border-radius:50%;border:2px solid ${CAT_COLOR.live};--ring:${CAT_COLOR.live}"></span>`
    : '';

  return (
    `<div class="cp-pin cp-mode-icon">` +
    pulseHtml +

    // Dot layer
    `<div class="cp-dot-layer" style="` +
    `width:${dotPx}px;height:${dotPx}px;border-radius:50%;` +
    `background:${fill};` +
    `border:1.5px solid rgba(0,0,0,0.25);` +
    `box-shadow:0 0 8px 2px ${dotGlow},0 2px 6px rgba(0,0,0,0.55);` +
    `"></div>` +

    // Icon layer
    `<div class="cp-icon-layer" style="` +
    `width:${badgePx}px;height:${badgePx}px;border-radius:50%;` +
    `background:rgba(12,12,14,0.93);` +
    `border:${borderPx}px solid ${fill};` +
    `display:flex;align-items:center;justify-content:center;` +
    `box-shadow:0 0 12px 3px ${glow},0 4px 10px rgba(0,0,0,0.6);` +
    `font-size:${emojiFontPx}px;line-height:1;user-select:none;` +
    `">${marker.icon}</div>` +

    `</div>`
  );
}

/**
 * Leaflet divIcon HTML for the user location pin.
 * The container height = S × 1.207 with the tip at its very bottom, matching
 * the iconAnchor set in MapCanvas.web.tsx.
 */
export function leafletUserPinHtml(webScale = 1): string {
  const color = CAT_COLOR.user;
  const S = Math.round(20 * webScale);
  const inner = Math.round(7 * webScale);
  const containerH = Math.round(S * (0.5 + 1 / Math.SQRT2));
  const shadow = `0 0 14px 4px rgba(168,85,247,0.65),0 4px 10px rgba(0,0,0,0.6)`;

  return (
    `<div class="cp-user-pin" style="width:${S}px;height:${containerH}px;display:flex;align-items:flex-start;justify-content:center;">` +
    `<div style="` +
    `width:${S}px;height:${S}px;` +
    `border-radius:50% 50% 0 50%;` +
    `background:${color};` +
    `transform:rotate(45deg);` +
    `display:flex;align-items:center;justify-content:center;` +
    `box-shadow:${shadow};` +
    `">` +
    `<div style="width:${inner}px;height:${inner}px;border-radius:50%;background:rgba(12,12,14,0.82);transform:rotate(-45deg);"></div>` +
    `</div>` +
    `</div>`
  );
}

// ── Leaflet CSS injection ─────────────────────────────────────────────────────

export function injectLeafletMarkerCss(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const id = 'city-pulse-marker-css';
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = `
    /*
     * --cp-scale is set on the Leaflet map container and cascades to every
     * .cp-pin. This lets MapCanvas.web.tsx do ONE style write on zoomend
     * instead of a per-marker forEach loop, and — crucially — the scale is
     * applied to the INNER .cp-pin, never to the Leaflet icon element itself
     * (which carries translate3d positioning we must not overwrite).
     */
    .cp-pin {
      position: relative;
      display: flex; align-items: center; justify-content: center;
      transform: scale(var(--cp-scale, 1));
      transform-origin: center center;
      transition: transform 0.12s ease-out;
    }
    /* Layers stacked at center */
    .cp-dot-layer, .cp-icon-layer {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      transition: opacity 0.35s ease;
    }
    /* Icon mode */
    .cp-mode-icon .cp-icon-layer { opacity: 1; pointer-events: auto; }
    .cp-mode-icon .cp-dot-layer  { opacity: 0; pointer-events: none; }
    /* Dot mode */
    .cp-mode-dot  .cp-icon-layer { opacity: 0; pointer-events: none; }
    .cp-mode-dot  .cp-dot-layer  { opacity: 1; pointer-events: auto; }
    /* Pulse ring */
    .cp-pulse {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      animation: cp-pulse 2.4s ease-in-out infinite;
      pointer-events: none;
      transition: opacity 0.35s ease;
    }
    .cp-mode-dot .cp-pulse { opacity: 0; }
    @keyframes cp-pulse {
      0%,100% { transform: translate(-50%,-50%) scale(1);   opacity: 0.5; }
      50%      { transform: translate(-50%,-50%) scale(1.5); opacity: 0.1; }
    }
    /* User location pin — teardrop shape, scales from tip not center */
    .cp-user-pin {
      transform: scale(var(--cp-scale, 1));
      transform-origin: bottom center;
      transition: transform 0.12s ease-out;
    }
    .leaflet-div-icon { background: transparent !important; border: none !important; }
  `;
  document.head.appendChild(el);
}

// ── Misc shared components ────────────────────────────────────────────────────

export function DarkMapPlaceholder({ children }: { children: ReactNode }) {
  return (
    <View style={placeholderStyles.root}>
      <LinearGradient colors={['#0a0a0a', '#111111', '#0a0a0a']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function MapBottomVignette() {
  return (
    <LinearGradient
      colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.75)']}
      locations={[0, 0.5, 1]}
      style={placeholderStyles.vignette}
      pointerEvents="none"
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const markerStyles = StyleSheet.create({
  hit: {
    width: SZ.hit,
    height: SZ.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: SZ.badge,
    height: SZ.badge,
    borderRadius: SZ.badge / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: SZ.dot,
    height: SZ.dot,
    borderRadius: SZ.dot / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  pulseRing: {
    position: 'absolute',
    width: SZ.pulse,
    height: SZ.pulse,
    borderRadius: SZ.pulse / 2,
    borderWidth: SZ.pulseBorder,
  },
  emoji: {
    fontSize: SZ.emoji,
    lineHeight: SZ.emoji * 1.2,
    textAlign: 'center',
  },
});

const placeholderStyles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  vignette: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 200,
  },
});

export const mapCanvasStyles = markerStyles;
