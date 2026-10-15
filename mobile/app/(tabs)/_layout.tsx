import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { color, contentMaxWidth, font } from "../../src/theme";

/** Three destinations. The active item is the accent — the only coloured thing in the chrome. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.muted,
        tabBarStyle: {
          backgroundColor: "#000000",
          borderTopColor: color.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58,
          paddingTop: 6,
          width: "100%",
          maxWidth: contentMaxWidth,
          alignSelf: "center",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
        },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color: tint, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={21} color={tint} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ color: tint, focused }) => (
            <Ionicons name={focused ? "grid" : "grid-outline"} size={20} color={tint} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "My Library",
          tabBarIcon: ({ color: tint, focused }) => (
            <Ionicons name={focused ? "bookmark" : "bookmark-outline"} size={20} color={tint} />
          ),
        }}
      />
    </Tabs>
  );
}
