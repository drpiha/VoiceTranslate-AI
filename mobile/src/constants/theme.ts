export type ColorScheme = 'indigo' | 'ocean' | 'sunset' | 'rose' | 'emerald' | 'lavender';

export interface AccentPalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  accentLight: string;
  secondary: string;
  gradient1: string;
  gradient2: string;
  gradient3: string;
  glow: string;
  glowAccent: string;
}

const accentPalettes: Record<ColorScheme, { light: AccentPalette; dark: AccentPalette }> = {
  indigo: {
    light: {
      primary: '#6366F1', primaryLight: '#818CF8', primaryDark: '#4F46E5',
      accent: '#EC4899', accentLight: '#F472B6', secondary: '#06B6D4',
      gradient1: '#6366F1', gradient2: '#EC4899', gradient3: '#06B6D4',
      glow: 'rgba(99, 102, 241, 0.4)', glowAccent: 'rgba(236, 72, 153, 0.4)',
    },
    dark: {
      primary: '#818CF8', primaryLight: '#A5B4FC', primaryDark: '#6366F1',
      accent: '#F472B6', accentLight: '#FBCFE8', secondary: '#22D3EE',
      gradient1: '#6366F1', gradient2: '#EC4899', gradient3: '#06B6D4',
      glow: 'rgba(129, 140, 248, 0.5)', glowAccent: 'rgba(244, 114, 182, 0.5)',
    },
  },
  ocean: {
    light: {
      primary: '#0EA5E9', primaryLight: '#38BDF8', primaryDark: '#0284C7',
      accent: '#06B6D4', accentLight: '#22D3EE', secondary: '#8B5CF6',
      gradient1: '#0EA5E9', gradient2: '#06B6D4', gradient3: '#8B5CF6',
      glow: 'rgba(14, 165, 233, 0.4)', glowAccent: 'rgba(6, 182, 212, 0.4)',
    },
    dark: {
      primary: '#38BDF8', primaryLight: '#7DD3FC', primaryDark: '#0EA5E9',
      accent: '#22D3EE', accentLight: '#67E8F9', secondary: '#A78BFA',
      gradient1: '#0EA5E9', gradient2: '#06B6D4', gradient3: '#8B5CF6',
      glow: 'rgba(56, 189, 248, 0.5)', glowAccent: 'rgba(34, 211, 238, 0.5)',
    },
  },
  sunset: {
    light: {
      primary: '#F59E0B', primaryLight: '#FBBF24', primaryDark: '#D97706',
      accent: '#EF4444', accentLight: '#F87171', secondary: '#F97316',
      gradient1: '#F59E0B', gradient2: '#EF4444', gradient3: '#F97316',
      glow: 'rgba(245, 158, 11, 0.4)', glowAccent: 'rgba(239, 68, 68, 0.4)',
    },
    dark: {
      primary: '#FBBF24', primaryLight: '#FCD34D', primaryDark: '#F59E0B',
      accent: '#F87171', accentLight: '#FCA5A5', secondary: '#FB923C',
      gradient1: '#F59E0B', gradient2: '#EF4444', gradient3: '#F97316',
      glow: 'rgba(251, 191, 36, 0.5)', glowAccent: 'rgba(248, 113, 113, 0.5)',
    },
  },
  rose: {
    light: {
      primary: '#EC4899', primaryLight: '#F472B6', primaryDark: '#DB2777',
      accent: '#F43F5E', accentLight: '#FB7185', secondary: '#A855F7',
      gradient1: '#EC4899', gradient2: '#F43F5E', gradient3: '#A855F7',
      glow: 'rgba(236, 72, 153, 0.4)', glowAccent: 'rgba(244, 63, 94, 0.4)',
    },
    dark: {
      primary: '#F472B6', primaryLight: '#FBCFE8', primaryDark: '#EC4899',
      accent: '#FB7185', accentLight: '#FECDD3', secondary: '#C084FC',
      gradient1: '#EC4899', gradient2: '#F43F5E', gradient3: '#A855F7',
      glow: 'rgba(244, 114, 182, 0.5)', glowAccent: 'rgba(251, 113, 133, 0.5)',
    },
  },
  emerald: {
    light: {
      primary: '#0D9488', primaryLight: '#14B8A6', primaryDark: '#0F766E',
      accent: '#06B6D4', accentLight: '#22D3EE', secondary: '#64748B',
      gradient1: '#0D9488', gradient2: '#06B6D4', gradient3: '#64748B',
      glow: 'rgba(13, 148, 136, 0.3)', glowAccent: 'rgba(6, 182, 212, 0.25)',
    },
    dark: {
      primary: '#14B8A6', primaryLight: '#2DD4BF', primaryDark: '#0D9488',
      accent: '#22D3EE', accentLight: '#67E8F9', secondary: '#94A3B8',
      gradient1: '#0D9488', gradient2: '#06B6D4', gradient3: '#94A3B8',
      glow: 'rgba(20, 184, 166, 0.35)', glowAccent: 'rgba(34, 211, 238, 0.3)',
    },
  },
  lavender: {
    light: {
      primary: '#8B5CF6', primaryLight: '#A78BFA', primaryDark: '#7C3AED',
      accent: '#EC4899', accentLight: '#F472B6', secondary: '#06B6D4',
      gradient1: '#8B5CF6', gradient2: '#EC4899', gradient3: '#06B6D4',
      glow: 'rgba(139, 92, 246, 0.4)', glowAccent: 'rgba(236, 72, 153, 0.4)',
    },
    dark: {
      primary: '#A78BFA', primaryLight: '#C4B5FD', primaryDark: '#8B5CF6',
      accent: '#F472B6', accentLight: '#FBCFE8', secondary: '#22D3EE',
      gradient1: '#8B5CF6', gradient2: '#EC4899', gradient3: '#06B6D4',
      glow: 'rgba(167, 139, 250, 0.5)', glowAccent: 'rgba(244, 114, 182, 0.5)',
    },
  },
};

export const colorSchemeNames: Record<ColorScheme, string> = {
  indigo: 'Indigo',
  ocean: 'Ocean',
  sunset: 'Sunset',
  rose: 'Rose Gold',
  emerald: 'Emerald',
  lavender: 'Lavender',
};

export const colorSchemeIcons: Record<ColorScheme, string> = {
  indigo: 'diamond',
  ocean: 'water',
  sunset: 'sunny',
  rose: 'rose',
  emerald: 'leaf',
  lavender: 'flower',
};

const baseLightColors = {
  background: '#F8FAFB',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  success: '#10B981',
  successLight: '#34D399',
  error: '#EF4444',
  errorLight: '#F87171',
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  info: '#3B82F6',
  infoLight: '#60A5FA',
  disabled: '#CBD5E1',
  shadow: 'rgba(0, 0, 0, 0.08)',
  overlay: 'rgba(15, 23, 42, 0.6)',
};

const baseDarkColors = {
  background: '#0C1117',
  surface: '#151D27',
  card: '#1A2332',
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textTertiary: '#64748B',
  border: '#1E293B',
  borderLight: '#0F172A',
  success: '#34D399',
  successLight: '#6EE7B7',
  error: '#F87171',
  errorLight: '#FCA5A5',
  warning: '#FBBF24',
  warningLight: '#FCD34D',
  info: '#60A5FA',
  infoLight: '#93C5FD',
  disabled: '#475569',
  shadow: 'rgba(0, 0, 0, 0.3)',
  overlay: 'rgba(0, 0, 0, 0.8)',
};

// Legacy exports for backward compatibility (now defaults to emerald)
export const lightColors = { ...baseLightColors, ...accentPalettes.emerald.light };
export const darkColors = { ...baseDarkColors, ...accentPalettes.emerald.dark };

export const typography = {
  fontSizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },
  fontWeights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
  lineHeights: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 48,
  '4xl': 64,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
};

export const shadows = {
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
};

export const semanticTypography = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '600' as const, lineHeight: 30, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 26, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24, letterSpacing: 0 },
  bodyMedium: { fontSize: 16, fontWeight: '500' as const, lineHeight: 24, letterSpacing: 0 },
  bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20, letterSpacing: 0.1 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16, letterSpacing: 0.2 },
  overline: { fontSize: 11, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.8 },
};

export const animation = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: { damping: 20, stiffness: 200 },
};

export const touchTargets = {
  minimum: 44,
  comfortable: 48,
};

export type Theme = {
  colors: typeof lightColors;
  typography: typeof typography;
  semanticTypography: typeof semanticTypography;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  shadows: typeof shadows;
  animation: typeof animation;
  touchTargets: typeof touchTargets;
};

export const createTheme = (isDark: boolean, colorScheme: ColorScheme = 'emerald'): Theme => {
  const base = isDark ? baseDarkColors : baseLightColors;
  const accents = accentPalettes[colorScheme]?.[isDark ? 'dark' : 'light'] ?? accentPalettes.emerald[isDark ? 'dark' : 'light'];
  return {
    colors: { ...base, ...accents } as typeof lightColors,
    typography,
    semanticTypography,
    spacing,
    borderRadius,
    shadows,
    animation,
    touchTargets,
  };
};
