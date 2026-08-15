declare module '*.png' {
  const source: number;
  export default source;
}

declare module '*.svg' {
  import type { FunctionComponent } from 'react';
  import type { SvgProps } from 'react-native-svg';

  const component: FunctionComponent<SvgProps>;
  export default component;
}
