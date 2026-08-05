export const colors = {
  background: '#080A0F',
  surface: '#111522',
  surfaceElevated: '#1A2030',
  border: '#293043',
  primary: '#FF5C7A',
  primaryPressed: '#D94363',
  secondary: '#9B7BFF',
  text: '#F8FAFC',
  textMuted: '#9AA5B8',
  success: '#48D597',
  warning: '#F7B955',
  danger: '#FF6B6B',
  overlay: 'rgba(8, 10, 15, 0.72)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
export const radii = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
export const typography = {
  display: 34,
  title: 24,
  heading: 19,
  body: 15,
  caption: 12,
} as const;

export const posterPalettes = [
  ['#FF5C7A', '#732B67'],
  ['#9B7BFF', '#303F9F'],
  ['#2CC7B4', '#174C6E'],
  ['#F7B955', '#9B3B55'],
  ['#5E8BFF', '#24305E'],
] as const;
