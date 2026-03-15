import { Stack } from "expo-router";
import { View, Text, Pressable, Linking } from "react-native";
import React, { useState } from "react";

function CreditsOverlay() {
  const [open, setOpen] = useState(false);
  const members = ["Aarthi", "Balamurugan", "Kanishka", "Lakshmi Prabha", "Sakthi"];
  return (
    <View style={{ position: "absolute", bottom: 10, right: 10, zIndex: 1000 }}>
      {/* Always-visible pill with LinkedIn cue */}
      <Pressable onPress={() => setOpen(!open)}
        style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999 }}>
        <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: "#0A66C2", alignItems: "center", justifyContent: "center", marginRight: 6 }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 10 }}>in</Text>
        </View>
        <Text style={{ color: "#fff", fontSize: 12 }}>Dev Team</Text>
      </Pressable>
      {open && (
        <View style={{ position: "absolute", bottom: 36, right: 0, backgroundColor: "rgba(0,0,0,0.85)", padding: 12, borderRadius: 8, width: 260 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: "#0A66C2", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>in</Text>
              </View>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Connect with the Developers</Text>
            </View>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={{ color: "#fff", fontSize: 16 }}>×</Text>
            </Pressable>
          </View>
          {members.map((m) => (
            <Pressable key={m} onPress={() => Linking.openURL(`https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(m)}%20software`)} style={{ paddingVertical: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: "#8ad", marginRight: 8 }} />
                <Text style={{ color: "#cde3ff" }}>{m}</Text>
                <Text style={{ color: "#cde3ff", marginLeft: "auto", fontSize: 11 }}>Open LinkedIn ↗</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <CreditsOverlay />
    </View>
  );
}
