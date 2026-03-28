import React, { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

export const PROVIDER_GOOGLE = 'google';

export const Marker = () => null;

const MapView = forwardRef((props, ref) => {
  useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
  }));
  return (
    <View style={[props.style, { pointerEvents: 'box-none' }]}>{props.children}</View>
  );
});

MapView.displayName = 'MapViewStub';

export default MapView;
