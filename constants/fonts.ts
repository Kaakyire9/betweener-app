// filepath: c:\Users\HP\OneDrive\Documents\Projects\betweener-app\constants\fonts.ts
import { Archivo_700Bold, useFonts as useArchivo } from '@expo-google-fonts/archivo';
import { Manrope_400Regular, useFonts as useManrope } from '@expo-google-fonts/manrope';

export function useAppFonts() {
  const [archivoLoaded] = useArchivo({ Archivo_700Bold });
  const [manropeLoaded] = useManrope({ Manrope_400Regular });
  return archivoLoaded && manropeLoaded;
}