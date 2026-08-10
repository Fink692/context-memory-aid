import { useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  AppSymbol,
  AppText,
  BrandMark,
  Button,
  Card,
  Screen,
  symbols,
} from "@/components/ui";
import { colors, radius, shadow, spacing } from "@/constants/theme";
import {
  decidePassportRead,
  demoBrief,
  demoMeeting,
  issueMeetingPass,
  passportFields,
  revokeMeetingPass,
  type AccessReceipt,
  type MeetingPass,
  type PassportFieldId,
} from "@/lib/passport-demo";

const stageLabels = ["Meeting", "Request", "Approve", "Brief", "Control"] as const;
const defaultFieldIds: PassportFieldId[] = [
  "relationship-summary",
  "open-commitments",
  "meeting-goals",
];
const demoIssuedAt = new Date("2026-08-11T14:00:00.000Z");

export default function PassportDemoScreen() {
  const { width } = useWindowDimensions();
  const { capture } = useLocalSearchParams<{ capture?: string }>();
  const captureMode = capture === "1";
  const compact = width < 860;
  const [stage, setStage] = useState(0);
  const [selectedFieldIds, setSelectedFieldIds] = useState<PassportFieldId[]>(defaultFieldIds);
  const [pass, setPass] = useState<MeetingPass>();
  const [receipt, setReceipt] = useState<AccessReceipt>();
  const [deniedAfterRevocation, setDeniedAfterRevocation] = useState(false);

  const approvedBrief = demoBrief(pass?.allowedFieldIds ?? []);

  const toggleField = (fieldId: PassportFieldId) => {
    const field = passportFields.find((item) => item.id === fieldId);
    if (!field?.shareable) return;
    setSelectedFieldIds((current) => current.includes(fieldId)
      ? current.filter((id) => id !== fieldId)
      : [...current, fieldId]);
  };

  const approveRequest = () => {
    const issuedPass = issueMeetingPass(selectedFieldIds, demoIssuedAt);
    const decision = decidePassportRead({
      pass: issuedPass,
      recipient: "Meeting Copilot",
      requestedFieldIds: issuedPass.allowedFieldIds,
      now: new Date("2026-08-11T14:05:00.000Z"),
    });
    if (!decision.allowed) return;
    setPass(issuedPass);
    setReceipt(decision.receipt);
    setStage(3);
  };

  const revokeAccess = () => {
    if (!pass) return;
    setPass(revokeMeetingPass(pass));
    setDeniedAfterRevocation(false);
  };

  const retryRevokedRead = () => {
    if (!pass) return;
    const decision = decidePassportRead({
      pass,
      recipient: "Meeting Copilot",
      requestedFieldIds: pass.allowedFieldIds,
      now: new Date("2026-08-11T14:10:00.000Z"),
    });
    setDeniedAfterRevocation(!decision.allowed && decision.reason === "revoked");
  };

  const resetDemo = () => {
    setStage(0);
    setSelectedFieldIds(defaultFieldIds);
    setPass(undefined);
    setReceipt(undefined);
    setDeniedAfterRevocation(false);
  };

  return (
    <Screen
      contentContainerStyle={[styles.page, captureMode && styles.capturePage]}
      safeEdges={["top", "right", "bottom", "left"]}
      scroll={!captureMode}
    >
      {!captureMode ? <View style={[styles.topbar, compact && styles.topbarCompact]}>
        <View style={styles.brandRow}>
          <BrandMark size={38} />
          <View>
            <AppText emphasis="bold" role="headline">Context Pass</AppText>
            <AppText role="caption1" tone="secondary">Private relationship memory, shared on your terms</AppText>
          </View>
        </View>
        <View style={[styles.topbarMeta, compact && styles.topbarMetaCompact]}>
          <Badge label="WORK · BUILD" tone="neutral" />
          <Badge label="AI PASSPORT DEMO" tone="tint" />
        </View>
      </View> : null}

      <View style={[styles.heroGrid, compact && styles.heroGridCompact, captureMode && styles.captureGrid]}>
        {!captureMode ? <View style={[styles.storyColumn, compact && styles.storyColumnCompact]}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <AppText emphasis="semibold" role="footnote" tone="tint">ONE MEETING. ONLY THE CONTEXT IT NEEDS.</AppText>
          </View>
          <AppText accessibilityRole="header" emphasis="bold" role="largeTitle" style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
            Useful context travels. Control stays with you.
          </AppText>
          <AppText role="body" style={styles.heroBody} tone="secondary">
            Meeting copilots should not need your inbox, contact book, or every private note. Context Pass shares a precise, revocable slice of memory through AI Passport.
          </AppText>

          <View style={styles.promiseList}>
            <PromiseRow copy="Choose the exact fields an app can read" symbol={symbols.checkCircle} />
            <PromiseRow copy="Access expires after thirty minutes" symbol={symbols.events} />
            <PromiseRow copy="Every read creates a visible receipt" symbol={symbols.shield} />
          </View>

          <View style={styles.flowLine}>
            <FlowNode label="Context" />
            <AppSymbol name={symbols.forward} size={15} tone="tertiary" />
            <FlowNode label="AI Passport" highlighted />
            <AppSymbol name={symbols.forward} size={15} tone="tertiary" />
            <FlowNode label="Copilot" />
          </View>
        </View> : null}

        <View style={[styles.demoShell, compact && styles.demoShellCompact, captureMode && styles.demoShellCapture]} testID="demo-shell">
          <Progress stage={stage} />
          <View style={styles.demoContent}>
            {stage === 0 ? <MeetingStage onContinue={() => setStage(1)} /> : null}
            {stage === 1 ? <RequestStage onContinue={() => setStage(2)} /> : null}
            {stage === 2 ? (
              <ApprovalStage
                onApprove={approveRequest}
                onToggle={toggleField}
                selectedFieldIds={selectedFieldIds}
              />
            ) : null}
            {stage === 3 ? (
              <BriefStage
                lines={approvedBrief}
                onContinue={() => setStage(4)}
                pass={pass}
              />
            ) : null}
            {stage === 4 ? (
              <ControlStage
                denied={deniedAfterRevocation}
                onReset={resetDemo}
                onRetry={retryRevokedRead}
                onRevoke={revokeAccess}
                pass={pass}
                receipt={receipt}
              />
            ) : null}
          </View>
        </View>
      </View>

      {!captureMode ? <View style={styles.judgingStrip}>
        <JudgingProof label="PRIVACY" value="Private notes never enter the pass" />
        <JudgingProof label="USER CONTROL" value="Preview · edit · expire · revoke" />
        <JudgingProof label="PASSPORT ROLE" value="Scoped pass + access receipt" />
      </View> : null}
    </Screen>
  );
}

function MeetingStage({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.stage}>
      <StageHeading
        kicker="UPCOMING"
        subtitle="Your calendar knows when. Context knows why it matters."
        title="Prepare without opening your whole life"
      />
      <Card style={styles.meetingCard} variant="raised">
        <View style={styles.meetingDate}>
          <AppText emphasis="bold" role="caption1" tone="destructive">AUG</AppText>
          <AppText emphasis="bold" role="title2">11</AppText>
        </View>
        <View style={styles.flex}>
          <AppText emphasis="semibold" role="headline">Thesis check-in</AppText>
          <AppText role="subheadline" tone="secondary">{demoMeeting.startsAtLabel}</AppText>
          <AppText role="subheadline" tone="secondary">{demoMeeting.location}</AppText>
        </View>
      </Card>
      <View style={styles.personRow}>
        <View style={styles.avatar}><AppText emphasis="bold" tone="tint">MC</AppText></View>
        <View style={styles.flex}>
          <AppText emphasis="semibold">{demoMeeting.person}</AppText>
          <AppText role="footnote" tone="secondary">{demoMeeting.role} · 3 confirmed memories</AppText>
        </View>
      </View>
      <Button onPress={onContinue} symbol={symbols.sparkles}>Ask Meeting Copilot to Prepare</Button>
      <AppText role="caption1" style={styles.centered} tone="tertiary">
        No context is shared until you approve a pass.
      </AppText>
    </View>
  );
}

function RequestStage({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.stage}>
      <StageHeading
        kicker="AI PASSPORT REQUEST"
        subtitle="A request is a question—not automatic access."
        title="Meeting Copilot wants context"
      />
      <View style={styles.requestIdentity}>
        <View style={styles.copilotIcon}><AppSymbol name={symbols.sparkles} size={24} tone="onTint" /></View>
        <View style={styles.flex}>
          <AppText emphasis="semibold" role="headline">Meeting Copilot</AppText>
          <AppText role="footnote" tone="secondary">Named recipient · Requesting for one purpose</AppText>
        </View>
        <Badge label="REQUEST" tone="warning" />
      </View>
      <Card style={styles.requestCard} variant="tinted">
        <Detail label="Purpose" value="Prepare for thesis check-in" />
        <Detail label="Person" value={demoMeeting.person} />
        <Detail label="Requested" value="3 context fields" />
        <Detail label="Duration" value="30 minutes" />
      </Card>
      <View style={styles.noticeRow}>
        <AppSymbol name={symbols.lock} size={18} tone="tint" />
        <AppText role="footnote" style={styles.flex} tone="secondary">
          It cannot browse Context. It can only read fields named in an approved pass.
        </AppText>
      </View>
      <Button onPress={onContinue}>Review Exact Fields</Button>
    </View>
  );
}

function ApprovalStage({
  onApprove,
  onToggle,
  selectedFieldIds,
}: {
  onApprove: () => void;
  onToggle: (fieldId: PassportFieldId) => void;
  selectedFieldIds: PassportFieldId[];
}) {
  return (
    <View style={styles.stage}>
      <StageHeading
        kicker="YOU ARE IN CONTROL"
        subtitle="Review the value, not just the category name."
        title="Choose what crosses the boundary"
      />
      <View style={styles.fieldList}>
        {passportFields.map((field) => {
          const selected = selectedFieldIds.includes(field.id);
          return (
            <Pressable
              accessibilityLabel={`${field.label}. ${field.preview}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: !field.shareable }}
              disabled={!field.shareable}
              key={field.id}
              onPress={() => onToggle(field.id)}
              style={({ pressed }) => [
                styles.fieldRow,
                selected && styles.fieldRowSelected,
                !field.shareable && styles.fieldRowLocked,
                pressed && styles.fieldRowPressed,
              ]}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected, !field.shareable && styles.checkboxLocked]}>
                <AppSymbol
                  name={field.shareable ? symbols.check : symbols.lock}
                  size={15}
                  tone={selected ? "onTint" : "tertiary"}
                  weight="bold"
                />
              </View>
              <View style={styles.flex}>
                <View style={styles.fieldTitleRow}>
                  <AppText emphasis="semibold" role="subheadline">{field.label}</AppText>
                  {!field.shareable ? <Badge label="NEVER SHARED" tone="neutral" /> : null}
                </View>
                <AppText role="footnote" tone="secondary">{field.preview}</AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.passTerms}>
        <Badge label="30 MIN" tone="tint" />
        <AppText role="footnote" style={styles.flex} tone="secondary">
          Meeting Copilot only · write-back requires your review · revoke anytime
        </AppText>
      </View>
      <Button disabled={!selectedFieldIds.length} onPress={onApprove} symbol={symbols.shield}>
        Approve One-Meeting Pass
      </Button>
    </View>
  );
}

function BriefStage({
  lines,
  onContinue,
  pass,
}: {
  lines: string[];
  onContinue: () => void;
  pass: MeetingPass | undefined;
}) {
  return (
    <View style={styles.stage}>
      <StageHeading
        kicker="SCOPED RESULT"
        subtitle="The copilot received approved meaning—not your raw notebook."
        title="Your meeting brief is ready"
      />
      <Card style={styles.briefCard} variant="raised">
        <View style={styles.briefHeader}>
          <View>
            <AppText emphasis="semibold" role="headline">Thesis check-in</AppText>
            <AppText role="footnote" tone="secondary">Prepared from {pass?.allowedFieldIds.length ?? 0} approved fields</AppText>
          </View>
          <View style={styles.safeMark}><AppSymbol name={symbols.checkCircle} size={20} tone="success" /></View>
        </View>
        {lines.map((line, index) => (
          <View key={line} style={styles.briefLine}>
            <View style={styles.numberDot}><AppText emphasis="bold" role="caption1" tone="tint">{index + 1}</AppText></View>
            <AppText role="subheadline" style={styles.flex}>{line}</AppText>
          </View>
        ))}
      </Card>
      <View style={styles.excludedRow}>
        <AppSymbol name={symbols.lock} size={17} tone="success" />
        <AppText role="footnote" style={styles.flex} tone="success">
          Private note excluded · no inbox or contact-book access
        </AppText>
      </View>
      <Button onPress={onContinue}>View Access Receipt</Button>
    </View>
  );
}

function ControlStage({
  denied,
  onReset,
  onRetry,
  onRevoke,
  pass,
  receipt,
}: {
  denied: boolean;
  onReset: () => void;
  onRetry: () => void;
  onRevoke: () => void;
  pass: MeetingPass | undefined;
  receipt: AccessReceipt | undefined;
}) {
  const revoked = pass?.status === "revoked";
  return (
    <View style={styles.stage}>
      <StageHeading
        kicker="ACCESS RECEIPT"
        subtitle="Receipts make data use visible. Revocation makes control real."
        title={revoked ? "Access revoked" : "See exactly what was read"}
      />
      <Card style={styles.receiptCard}>
        <View style={styles.receiptHeader}>
          <View style={[styles.receiptIcon, revoked && styles.receiptIconRevoked]}>
            <AppSymbol name={revoked ? symbols.lock : symbols.checkCircle} size={23} tone={revoked ? "destructive" : "success"} />
          </View>
          <View style={styles.flex}>
            <AppText emphasis="semibold" role="headline">{receipt?.recipient ?? "Meeting Copilot"}</AppText>
            <AppText role="footnote" tone="secondary">Read once · Today at 9:05 AM</AppText>
          </View>
          <Badge label={revoked ? "REVOKED" : "ACTIVE"} tone={revoked ? "danger" : "success"} />
        </View>
        <View style={styles.receiptRule} />
        <Detail label="Purpose" value={receipt?.purpose ?? "Thesis check-in"} />
        <Detail label="Fields read" value={`${receipt?.fieldIds.length ?? 0} approved`} />
        <Detail label="Private notes" value="Not shared" valueTone="success" />
        <Detail label="Auto-expiry" value="Today at 9:30 AM" />
        <Detail label="Write-back" value={receipt?.writeBack === "review-required" ? "Review required" : "—"} />
      </Card>

      {denied ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.deniedBanner}>
          <AppSymbol name={symbols.warning} size={19} tone="destructive" />
          <View style={styles.flex}>
            <AppText emphasis="semibold" role="subheadline" tone="destructive">Access denied</AppText>
            <AppText role="footnote" tone="destructive">This pass was revoked. No context left AI Passport.</AppText>
          </View>
        </View>
      ) : null}

      {!revoked ? (
        <Button onPress={onRevoke} symbol={symbols.lock} variant="danger">Revoke Access Now</Button>
      ) : (
        <Button onPress={onRetry} symbol={symbols.sparkles} variant="secondary">Copilot Tries Again</Button>
      )}
      <Button onPress={onReset} variant="quiet">Replay Demo</Button>
    </View>
  );
}

function Progress({ stage }: { stage: number }) {
  return (
    <View accessibilityLabel={`Demo step ${stage + 1} of ${stageLabels.length}: ${stageLabels[stage]}`} style={styles.progress}>
      {stageLabels.map((label, index) => (
        <View key={label} style={styles.progressItem}>
          <View style={[styles.progressDot, index <= stage && styles.progressDotActive]}>
            {index < stage ? <AppSymbol name={symbols.check} size={12} tone="onTint" weight="bold" /> : null}
          </View>
          <AppText emphasis={index === stage ? "semibold" : "regular"} role="caption2" tone={index === stage ? "tint" : "tertiary"}>
            {label}
          </AppText>
          {index < stageLabels.length - 1 ? <View style={[styles.progressRule, index < stage && styles.progressRuleActive]} /> : null}
        </View>
      ))}
    </View>
  );
}

function StageHeading({ kicker, subtitle, title }: { kicker: string; subtitle: string; title: string }) {
  return (
    <View style={styles.stageHeading}>
      <AppText emphasis="bold" role="caption1" tone="tint">{kicker}</AppText>
      <AppText accessibilityRole="header" emphasis="bold" role="title2">{title}</AppText>
      <AppText role="subheadline" tone="secondary">{subtitle}</AppText>
    </View>
  );
}

function Detail({
  label,
  value,
  valueTone = "primary",
}: {
  label: string;
  value: string;
  valueTone?: "primary" | "success";
}) {
  return (
    <View style={styles.detailRow}>
      <AppText role="footnote" tone="secondary">{label}</AppText>
      <AppText emphasis="semibold" role="footnote" style={styles.detailValue} tone={valueTone}>{value}</AppText>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: "danger" | "neutral" | "success" | "tint" | "warning" }) {
  return (
    <View style={[
      styles.badge,
      tone === "tint" && styles.badgeTint,
      tone === "success" && styles.badgeSuccess,
      tone === "warning" && styles.badgeWarning,
      tone === "danger" && styles.badgeDanger,
    ]}>
      <AppText
        emphasis="bold"
        role="caption2"
        tone={tone === "danger" ? "destructive" : tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "tint" ? "tint" : "secondary"}
      >
        {label}
      </AppText>
    </View>
  );
}

function PromiseRow({ copy, symbol }: { copy: string; symbol: typeof symbols[keyof typeof symbols] }) {
  return (
    <View style={styles.promiseRow}>
      <View style={styles.promiseIcon}><AppSymbol name={symbol} size={18} tone="tint" /></View>
      <AppText role="subheadline" style={styles.flex}>{copy}</AppText>
    </View>
  );
}

function FlowNode({ highlighted = false, label }: { highlighted?: boolean; label: string }) {
  return (
    <View style={[styles.flowNode, highlighted && styles.flowNodeHighlighted]}>
      <AppText emphasis="semibold" role="caption1" tone={highlighted ? "tint" : "secondary"}>{label}</AppText>
    </View>
  );
}

function JudgingProof({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.judgingProof}>
      <AppText emphasis="bold" role="caption2" tone="tint">{label}</AppText>
      <AppText emphasis="medium" role="footnote">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { maxWidth: 1180, gap: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  capturePage: { width: "100%", maxWidth: 500, padding: 0, gap: 0 },
  flex: { flex: 1, minWidth: 0 },
  centered: { textAlign: "center" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg },
  topbarCompact: { flexDirection: "column", alignItems: "flex-start", gap: spacing.md },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  topbarMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: spacing.sm },
  topbarMetaCompact: { width: "100%", justifyContent: "flex-start" },
  heroGrid: { flexDirection: "row", alignItems: "center", gap: spacing.xxxl },
  heroGridCompact: { flexDirection: "column", alignItems: "stretch", gap: spacing.xl },
  captureGrid: { width: "100%", flex: 1, flexDirection: "row", alignItems: "stretch", gap: 0 },
  storyColumn: { flex: 1, minWidth: 0, gap: spacing.xl, paddingVertical: spacing.xl },
  storyColumnCompact: { paddingVertical: spacing.md },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  eyebrowDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primaryFill },
  heroTitle: { maxWidth: 560, fontSize: 46, lineHeight: 52 },
  heroTitleCompact: { fontSize: 38, lineHeight: 45 },
  heroBody: { maxWidth: 560, fontSize: 18, lineHeight: 27 },
  promiseList: { gap: spacing.md },
  promiseRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  promiseIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  flowLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  flowNode: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.fill },
  flowNodeHighlighted: { backgroundColor: colors.primarySoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.primaryBorder },
  demoShell: { width: 500, minHeight: 670, borderRadius: 28, borderCurve: "continuous", backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: "hidden", ...shadow },
  demoShellCompact: { width: "100%", maxWidth: 560, minHeight: 0, alignSelf: "center" },
  demoShellCapture: { flex: 1, width: "100%", maxWidth: 500, minHeight: 670, alignSelf: "stretch", borderRadius: 0, borderWidth: 0 },
  progress: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surfaceAlt, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  progressItem: { flex: 1, alignItems: "center", gap: spacing.xs, position: "relative" },
  progressDot: { zIndex: 2, width: 20, height: 20, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised },
  progressDotActive: { borderColor: colors.primaryFill, backgroundColor: colors.primaryFill },
  progressRule: { position: "absolute", top: 10, left: "60%", right: "-40%", height: 2, backgroundColor: colors.border },
  progressRuleActive: { backgroundColor: colors.primaryFill },
  demoContent: { flex: 1, padding: spacing.xl },
  stage: { flex: 1, gap: spacing.lg },
  stageHeading: { gap: spacing.xs },
  meetingCard: { flexDirection: "row", alignItems: "center", gap: spacing.lg, padding: spacing.lg },
  meetingDate: { width: 58, height: 62, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerSoft },
  personRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xs },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  requestIdentity: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  copilotIcon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryFill },
  requestCard: { gap: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.primaryBorder },
  detailRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.lg, paddingVertical: spacing.sm },
  detailValue: { flex: 1, textAlign: "right" },
  noticeRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  fieldList: { gap: spacing.sm },
  fieldRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  fieldRowSelected: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  fieldRowLocked: { backgroundColor: colors.surfaceAlt },
  fieldRowPressed: { opacity: 0.72 },
  checkbox: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.borderStrong },
  checkboxSelected: { borderColor: colors.primaryFill, backgroundColor: colors.primaryFill },
  checkboxLocked: { borderColor: colors.border, backgroundColor: colors.fill },
  fieldTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  passTerms: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  briefCard: { gap: spacing.md, padding: spacing.lg },
  briefHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  safeMark: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.successSoft },
  briefLine: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  numberDot: { width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  excludedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.successSoft },
  receiptCard: { gap: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  receiptHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingBottom: spacing.md },
  receiptIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.successSoft },
  receiptIconRevoked: { backgroundColor: colors.dangerSoft },
  receiptRule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: spacing.sm },
  deniedBanner: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  badge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.fill },
  badgeTint: { backgroundColor: colors.primarySoft },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeWarning: { backgroundColor: colors.warningSoft },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  judgingStrip: { flexDirection: "row", alignItems: "stretch", flexWrap: "wrap", borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: "hidden" },
  judgingProof: { flex: 1, minWidth: 220, gap: spacing.xs, padding: spacing.lg, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
});
