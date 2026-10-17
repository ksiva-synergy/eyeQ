import { okResponseSchema, tokenSessionSchema } from "@eyeq/api-contract";
import { t, type MessageKey } from "@eyeq/i18n";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { classify, errorKey, RESEND_AFTER_S, shown, type Target } from "@/lib/sign-in";
import { GUTTER, TOUCH, useColors } from "@/lib/theme";

type Step = { kind: "id" } | { kind: "code"; target: Target; sentAt: number };

/**
 * Board 1b: phone or email, then the 6-digit code, through the server's routes
 * (POST /api/auth/otp, POST /api/auth/token), so phone rules and limits match web.
 * Native components and fonts replace these plain ones in 8b.
 */
export default function SignIn() {
  const c = useColors();
  const { signIn } = useAuth();
  const [step, setStep] = useState<Step>({ kind: "id" });
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(API_URL ? null : "mobile.noServer");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (step.kind !== "code") return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [step.kind]);

  async function sendCode(target: Target) {
    setBusy(true);
    setError(null);
    const r = await api.post("/api/auth/otp", okResponseSchema, target, { anonymous: true });
    setBusy(false);
    if (r.ok) {
      setCode("");
      setStep({ kind: "code", target, sentAt: Date.now() });
      setNow(Date.now());
    } else setError(errorKey(r.code));
  }

  function next() {
    const target = classify(id);
    if (!target) {
      setError("auth.error.notPhoneOrEmail");
      return;
    }
    void sendCode(target);
  }

  async function verify() {
    if (step.kind !== "code" || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const r = await api.post(
      "/api/auth/token",
      tokenSessionSchema,
      { ...step.target, token: code },
      { anonymous: true },
    );
    if (r.ok) {
      await signIn(r.data); // the route guard moves on to the signed-in screens
      return;
    }
    setBusy(false);
    setError(errorKey(r.code));
  }

  const s = styles(c);
  const alert = error && (
    <Text accessibilityRole="alert" style={s.alert}>
      {t(error)}
    </Text>
  );

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.step}>{t("auth.step")}</Text>
          {step.kind === "id" ? (
            <>
              <Text accessibilityRole="header" style={s.title}>
                {t("auth.title")}
              </Text>
              <Text style={s.secondary}>{t("auth.subtitle")}</Text>
              {alert}
              <Text style={s.label} nativeID="id-label">
                {t("auth.phone.label")}
              </Text>
              <TextInput
                testID="sign-in-id"
                accessibilityLabelledBy="id-label"
                accessibilityLabel={t("auth.phone.label")}
                value={id}
                onChangeText={setId}
                onSubmitEditing={next}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                inputMode="email"
                returnKeyType="send"
                style={s.input}
                placeholderTextColor={c["text-muted"]}
              />
              <Text style={s.hint}>{t("auth.phone.hint")}</Text>
              <Text style={s.caption}>{t("auth.minor")}</Text>
            </>
          ) : (
            <>
              <Text accessibilityRole="header" style={s.title}>
                {t("auth.code.title")}
              </Text>
              <View style={s.row}>
                <Text style={s.secondary}>
                  {t("auth.code.sent", { phone: shown(step.target) })}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setError(null);
                    setStep({ kind: "id" });
                  }}
                  style={s.link}
                >
                  <Text style={s.linkText}>{t("auth.code.change")}</Text>
                </Pressable>
              </View>
              {alert}
              <Text style={s.label} nativeID="code-label">
                {t("auth.code.label")}
              </Text>
              <TextInput
                testID="sign-in-code"
                accessibilityLabelledBy="code-label"
                accessibilityLabel={t("auth.code.label")}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                onSubmitEditing={verify}
                inputMode="numeric"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                style={[s.input, s.code]}
              />
              <Resend
                wait={Math.max(0, RESEND_AFTER_S - Math.floor((now - step.sentAt) / 1000))}
                busy={busy}
                onResend={() => void sendCode(step.target)}
                styles={s}
              />
            </>
          )}
        </ScrollView>
        <View style={s.actions}>
          <Pressable
            testID="sign-in-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy || !API_URL}
            onPress={step.kind === "id" ? next : verify}
            style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
          >
            {busy ? (
              <ActivityIndicator color={c["on-cta"]} />
            ) : (
              <Text style={s.ctaText}>
                {t(step.kind === "id" ? "auth.phone.send" : "auth.code.verify")}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Resend(p: {
  wait: number;
  busy: boolean;
  onResend: () => void;
  styles: ReturnType<typeof styles>;
}) {
  return (
    <View style={[p.styles.row, { justifyContent: "center" }]}>
      <Text style={p.styles.muted}>{t("auth.code.didntGet")}</Text>
      {p.wait > 0 ? (
        <Text style={[p.styles.muted, { fontVariant: ["tabular-nums"] }]}>
          {t("auth.code.resendIn", { s: `0:${String(p.wait).padStart(2, "0")}` })}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={p.busy}
          onPress={p.onResend}
          style={p.styles.link}
        >
          <Text style={p.styles.linkText}>{t("auth.code.resend")}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.ground },
    body: { padding: GUTTER, gap: 12 },
    step: { color: c["text-muted"], fontSize: 13, fontWeight: "700", letterSpacing: 1 },
    title: {
      color: c["text-primary"],
      fontSize: 40,
      lineHeight: 40,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    secondary: { color: c["text-secondary"], fontSize: 16, lineHeight: 22, flexShrink: 1 },
    muted: { color: c["text-muted"], fontSize: 14 },
    label: { color: c["text-primary"], fontSize: 14, fontWeight: "700", marginTop: 8 },
    hint: { color: c["text-muted"], fontSize: 13 },
    caption: {
      color: c["text-secondary"],
      fontSize: 13,
      lineHeight: 18,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      backgroundColor: c["surface-1"],
      padding: 12,
      marginTop: 8,
    },
    input: {
      minHeight: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c["border-strong"],
      backgroundColor: c["surface-1"],
      color: c["text-primary"],
      paddingHorizontal: 16,
      fontSize: 18,
    },
    code: { letterSpacing: 8, fontSize: 24, fontVariant: ["tabular-nums"] },
    alert: {
      color: c["text-primary"],
      borderColor: c["cta-text"],
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      fontSize: 14,
    },
    row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    link: { minHeight: TOUCH, justifyContent: "center" },
    linkText: { color: c["primary-text"], fontWeight: "800", fontSize: 15 },
    actions: { padding: GUTTER, paddingTop: 8 },
    cta: {
      minHeight: 52,
      borderRadius: 999,
      backgroundColor: c.cta,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    ctaText: { color: c["on-cta"], fontSize: 17, fontWeight: "800" },
  });
