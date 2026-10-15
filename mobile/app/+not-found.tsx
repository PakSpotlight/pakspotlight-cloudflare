import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { PillButton } from "../src/components/PillButton";
import { color, font, gutter, space, type } from "../src/theme";

export default function NotFoundRoute() {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>That page isn&apos;t here</Text>
      <Text style={styles.body}>The link may be old, or the title may have left the archive.</Text>
      <PillButton label="Browse the archive" onPress={() => router.replace("/browse")} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg, alignItems: "center", justifyContent: "center", padding: gutter, gap: space.md },
  title: { color: color.text, fontFamily: font.extra, fontSize: type.h2, textAlign: "center" },
  body: { color: color.muted, fontFamily: font.body, fontSize: type.body, textAlign: "center", maxWidth: 300, lineHeight: 22 },
});
