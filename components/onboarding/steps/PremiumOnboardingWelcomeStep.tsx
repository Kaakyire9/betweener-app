import { LinearGradient } from "expo-linear-gradient";
import { Image, View } from "react-native";

type Props = {
  asset: any;
  dark: boolean;
  styles: any;
};

export function PremiumOnboardingWelcomeStep({ asset, dark, styles }: Props) {
  return (
    <View style={styles.welcomeBody}>
      <View style={styles.heroVisual}>
        {!dark ? <View style={styles.heroBaseGlow} /> : null}
        <Image source={asset} style={styles.heroImage} resizeMode="contain" />
        <LinearGradient colors={dark ? ["transparent", "#071E22"] : ["transparent", "#FFF7ED"]} style={styles.heroFade} />
      </View>
    </View>
  );
}
