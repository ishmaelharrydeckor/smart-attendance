export const Colors = {
  Primary: '#4F46E5',
  PrimaryLight: '#EEF2FF',
  Success: '#16A34A',
  SuccessLight: '#F0FDF4',
  Warning: '#D97706',
  WarningLight: '#FFFBEB',
  Danger: '#DC2626',
  DangerLight: '#FEF2F2',
  Neutral900: '#111827',
  Neutral600: '#4B5563',
  Neutral400: '#9CA3AF',
  Neutral200: '#E5E7EB',
  Neutral100: '#F3F4F6',
  White: '#FFFFFF',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const Typography = {
  Display: {
    fontSize: 28,
    fontWeight: '600' as const,
  },
  Heading: {
    fontSize: 20,
    fontWeight: '600' as const,
  },
  Body: {
    fontSize: 15,
    fontWeight: '400' as const,
  },
  Label: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  Caption: {
    fontSize: 11,
    fontWeight: '400' as const,
  },
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
};

export const Shadows = {
  Card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  Float: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
};
