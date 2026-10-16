// Raw colour ladders for the Slate Rose palette. `tokens.ts` gives them meaning.

export const ink = {
  50: '#F4F4F5',
  100: '#E8E8EA',
  200: '#E1E1E4',
  300: '#CBCBD0',
  400: '#9A9AA2',
  500: '#686871',
  600: '#4A4A52',
  700: '#33333A',
  800: '#2A2C31',
  900: '#17181C',
  950: '#0D0E12',
} as const;

// The primary: slate rose. White text needs step 500 to clear 4.5:1; 400 is for hovers, pills and marks.
export const rose = {
  50: '#FAECEC',
  100: '#F4D9DB',
  200: '#E8B8BD',
  300: '#D98992',
  400: '#C96F7A',
  500: '#B5535E',
  600: '#9A4450',
  700: '#7E3741',
  800: '#5E2930',
  900: '#3E1B20',
} as const;

// The secondary: warm mineral grey, for muted text, strokes and quiet surfaces.
export const stone = {
  50: '#F7F5F3',
  100: '#F1EEEB',
  200: '#E7E2DE',
  300: '#D6D0CC',
  400: '#B8B1AD',
  500: '#9A9390',
  600: '#817B79',
  700: '#6F6968',
  800: '#4C4846',
  900: '#2A2C31',
} as const;

// Error red only. One hue away from the rose so "this failed" never reads as the brand.
export const ember = {
  50: '#FDECEC',
  100: '#FAD3D4',
  200: '#F4A7A9',
  300: '#ED7477',
  400: '#E5484D',
  500: '#C33035',
  600: '#9A1F24',
  700: '#7A171B',
  800: '#5C1114',
  900: '#3E0B0D',
} as const;

export const glow = {
  50: '#FEF6E7',
  100: '#FCE8BE',
  200: '#F9D488',
  300: '#F7BF54',
  400: '#F5A524',
  500: '#D98708',
  600: '#A96806',
  700: '#7D4D05',
} as const;

export const moss = {
  50: '#E6FAF7',
  100: '#C0F2EA',
  200: '#8AE5D8',
  300: '#4FD3C2',
  400: '#16B8A6',
  500: '#0F9689',
  600: '#0B766C',
  700: '#085B53',
} as const;

export const tide = {
  50: '#EEF2FC',
  100: '#DAE2F8',
  200: '#B9C8F1',
  300: '#93ABE8',
  400: '#6C8FE0',
  500: '#4D6FC4',
  600: '#3A559C',
  700: '#2C4076',
} as const;

// Paper beige. `ground` is the page, `raised` is a card; the rest are steps of the stone ramp, never a cool grey.
export const paper = {
  ground: '#F5F1EE',
  raised: '#FBF9F7',
  soft: stone[100],
  well: stone[200],
  hairline: stone[200],
  edge: stone[300],
} as const;

// "R G B", for `rgb(var / alpha)` composition in shadows and scrims.
export const INK_RGB = '23 24 28';
export const ROSE_RGB = '181 83 94';
