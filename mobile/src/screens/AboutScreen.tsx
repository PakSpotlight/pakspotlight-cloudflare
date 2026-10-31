import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { TopBar } from "../components/TopBar";
import { color, contentMaxWidth, font, gutter, space, type } from "../theme";

const CONTACT_EMAIL = "pakifun3@gmail.com";

export function AboutScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TopBar title="About" />
      <View style={styles.section}>
        <Text style={styles.heading}>Classic TV Pakistan</Text>
        <Text style={styles.body}>
          Classic TV Pakistan is a viewing guide to memorable Pakistani television programmes.
          Explore the archive, discover classic dramas and continue watching where you left off.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.subheading}>Contact us</Text>
        <Text style={styles.label}>Email</Text>
        <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>
          {CONTACT_EMAIL}
        </Text>
        <Text style={styles.label}>Phone 1</Text>
        <Text style={styles.body}>Coming soon</Text>
        <Text style={styles.label}>Phone 2</Text>
        <Text style={styles.body}>Coming soon</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.subheading}>Copyright disclaimer</Text>
        <Text style={styles.body}>
          All programmes, videos, images, music and other materials shown through Classic TV Pakistan
          belong to their respective copyright owners. Classic TV Pakistan does not claim ownership
          of this third-party content. The app does not host or store the underlying programme or
          video files; playback is provided through embedded third-party players or source platforms.
          If you are a rights holder and have a concern, please contact us at {CONTACT_EMAIL}.
        </Text>
      </View>
      <Text style={styles.version}>Classic TV Pakistan</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" },
  content: { padding: gutter, paddingBottom: space.xxl },
  section: { backgroundColor: color.surface, borderColor: color.line, borderWidth: 1, borderRadius: 16, padding: space.lg, marginBottom: space.md },
  heading: { color: color.accent, fontFamily: font.extra, fontSize: 23, marginBottom: space.sm },
  subheading: { color: color.text, fontFamily: font.bold, fontSize: type.h3, marginBottom: space.md },
  body: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 24 },
  label: { color: color.text, fontFamily: font.medium, fontSize: type.meta, marginTop: space.sm },
  link: { color: color.accent, fontFamily: font.bold, fontSize: type.body, marginTop: 3 },
  version: { color: color.dim, fontFamily: font.body, fontSize: type.micro, textAlign: "center", marginTop: space.md },
});
