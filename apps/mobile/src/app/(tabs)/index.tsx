import { meResponseSchema } from "@eyeq/api-contract";
import { t } from "@eyeq/i18n";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { GUTTER, TOUCH, useColors } from "@/lib/theme";

/**
 * Phase 8a's signed-in screen: GET /api/v1/me with the bearer token, shown as it comes back.
 * Home (board 2) replaces it in 8c.
 */
export default function Me() {
  const c = useColors();
  const { signOut } = useAuth();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await api.get("/api/v1/me", meResponseSchema);
      if (!r.ok) throw new Error(r.code);
      return r.data;
    },
  });
  const s = styles(c);
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.body}>
        <Text accessibilityRole="header" style={s.title}>
          {t("mobile.me.title")}
        </Text>
        {me.isPending ? (
          <ActivityIndicator accessibilityLabel={t("common.loading")} color={c["primary-text"]} />
        ) : me.isError ? (
          <View style={{ gap: 12 }}>
            <Text accessibilityRole="alert" style={s.secondary}>
              {t("mobile.me.loadFailed")}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void me.refetch()} style={s.ghost}>
              <Text style={s.ghostText}>{t("common.retry")}</Text>
            </Pressable>
          </View>
        ) : (
          <View testID="me-card" style={s.card}>
            {me.data.displayName ? <Text style={s.name}>{me.data.displayName}</Text> : null}
            {me.data.phone ? <Text style={s.secondary}>{me.data.phone}</Text> : null}
            {me.data.email ? <Text style={s.secondary}>{me.data.email}</Text> : null}
            <View style={s.stats}>
              <Text style={s.stat}>{t("level.long", { level: me.data.stats.level })}</Text>
              <Text style={s.stat}>{t("xp.total", { xp: me.data.stats.totalXp })}</Text>
              <Text style={s.stat}>{t("streak.compact", { n: me.data.stats.currentStreak })}</Text>
              <Text style={s.stat}>{t("coins.count", { n: me.data.stats.coins })}</Text>
            </View>
          </View>
        )}
      </ScrollView>
      <View style={{ padding: GUTTER }}>
        <Pressable
          testID="sign-out"
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={s.ghost}
        >
          <Text style={s.ghostText}>{t("account.signOut")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.ground },
    body: { padding: GUTTER, gap: 16 },
    title: {
      color: c["text-primary"],
      fontSize: 32,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    secondary: { color: c["text-secondary"], fontSize: 16 },
    card: {
      backgroundColor: c["surface-1"],
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 16,
      gap: 6,
    },
    name: { color: c["text-primary"], fontSize: 22, fontWeight: "800" },
    stats: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
    stat: {
      color: c["text-primary"],
      fontSize: 15,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    ghost: {
      minHeight: TOUCH,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c["border-strong"],
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    ghostText: { color: c["text-primary"], fontSize: 16, fontWeight: "800" },
  });
