// filepath: c:\Users\HP\OneDrive\Documents\Projects\betweener-app\constants\fonts.ts
import { Archivo_700Bold, useFonts as useArchivo } from '@expo-google-fonts/archivo';
import {
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    useFonts as useManrope,
} from '@expo-google-fonts/manrope';
import {
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_600SemiBold_Italic,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
    useFonts as usePlayfair,
} from '@expo-google-fonts/playfair-display';

export function useAppFonts() {
  const [archivoLoaded] = useArchivo({ Archivo_700Bold });
  const [manropeLoaded] = useManrope({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  const [playfairLoaded] = usePlayfair({
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_600SemiBold_Italic,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
  });

  return archivoLoaded && manropeLoaded && playfairLoaded;
}
