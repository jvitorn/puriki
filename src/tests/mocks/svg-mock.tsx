import type * as React from 'react';
import { View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

export default function SvgMock(props: SvgProps) {
  return <View {...(props as React.ComponentProps<typeof View>)} />;
}
