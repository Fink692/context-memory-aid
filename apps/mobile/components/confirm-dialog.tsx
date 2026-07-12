import { Modal, Platform, StyleSheet, View } from "react-native";
import { AppText, BarButton, Button, Screen } from "@/components/ui";
import { spacing } from "@/constants/theme";

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      allowSwipeDismissal={!busy}
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      visible={visible}
    >
      <Screen
        accessibilityViewIsModal
        contentContainerStyle={styles.sheet}
        safeEdges={["top", "right", "bottom", "left"]}
        {...(busy ? {} : { onAccessibilityEscape: onCancel })}
      >
        <View style={styles.sheetBar}>
          <BarButton disabled={busy} onPress={onCancel}>Cancel</BarButton>
          <AppText
            accessibilityRole="header"
            emphasis="semibold"
            numberOfLines={2}
            role="headline"
            style={styles.title}
          >
            {title}
          </AppText>
          <View accessibilityElementsHidden importantForAccessibility="no" style={styles.barSpacer} />
        </View>

        <View style={styles.content}>
          <AppText role="body" tone="secondary">{body}</AppText>
          <View style={styles.primaryAction}>
            <Button
              accessibilityHint={destructive ? "This action may not be reversible" : undefined}
              loading={busy}
              onPress={onConfirm}
              variant={destructive ? "danger" : "primary"}
            >
              {confirmLabel}
            </Button>
          </View>
        </View>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flexGrow: 1, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  sheetBar: { minHeight: 44, flexDirection: "row", alignItems: "center" },
  title: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm, textAlign: "center" },
  barSpacer: { width: 44, height: 44 },
  content: { flex: 1, justifyContent: "space-between", gap: spacing.xl, paddingTop: spacing.xl },
  primaryAction: { width: "100%", marginTop: "auto" },
});
