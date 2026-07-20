import { useMemo, useState } from "react";
import { FlatList, Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { ActionItem, Contact } from "@context/shared";
import {
  AppSymbol,
  AppText,
  Avatar,
  BarButton,
  Button,
  EmptyState,
  ErrorBanner,
  IconButton,
  ListRow,
  ListSection,
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { actionDueBucket, sortOpenActions, type ActionDueBucket } from "@/lib/action-schedule";
import { displayDate, displayEventSchedule, relativeDate } from "@/lib/date";
import { eventHasEnded } from "@/lib/event-lifecycle";
import { mutationErrorMessage } from "@/lib/mutation-error";
import { useAppStore } from "@/store/app-store";

const bucketOrder: Array<{ id: ActionDueBucket; title: string }> = [
  { id: "overdue", title: "Overdue" },
  { id: "today", title: "Today" },
  { id: "upcoming", title: "Upcoming" },
  { id: "undated", title: "No Date" },
];

function searchMatches(contact: Contact, query: string): boolean {
  return [
    contact.displayName,
    contact.company,
    contact.role,
    contact.email,
    contact.phone,
    contact.metAt,
    contact.relationshipContext,
    contact.lastDiscussed,
    contact.recentUpdate,
    ...(contact.conversationTopics ?? []),
  ]
    .filter(Boolean)
    .some((value) => value?.toLocaleLowerCase().includes(query));
}

function followUpDetail(action: ActionItem, bucket: ActionDueBucket): string {
  if (bucket === "overdue") return "Overdue";
  if (bucket === "today") return "Today";
  if (action.dueAt) return displayDate(action.dueAt);
  return "No date";
}

export default function HomeScreen() {
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const actions = useAppStore((state) => state.actions);
  const currentEventId = useAppStore((state) => state.currentEventId);
  const hasSeenContactImportPrompt = useAppStore((state) => state.hasSeenContactImportPrompt);
  const setHasSeenContactImportPrompt = useAppStore((state) => state.setHasSeenContactImportPrompt);
  const setCurrentEventId = useAppStore((state) => state.setCurrentEventId);
  const setActionCompleted = useAppStore((state) => state.setActionCompleted);
  const [query, setQuery] = useState("");
  const [recentlyCompletedId, setRecentlyCompletedId] = useState<string>();
  const [completedVisibleCount, setCompletedVisibleCount] = useState(0);
  const [mutationBusyId, setMutationBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  const event = events.find((item) => item.id === currentEventId);

  const attendees = useMemo(() => {
    if (!event) return [];
    return event.attendeeContactIds
      .map((id) => contacts.find((contact) => contact.id === id))
      .filter((contact): contact is Contact => contact !== undefined)
      .sort((left, right) => {
        if (!left.lastSpokeAt) return -1;
        if (!right.lastSpokeAt) return 1;
        return left.lastSpokeAt.localeCompare(right.lastSpokeAt);
      });
  }, [contacts, event]);

  const directoryPeople = useMemo(() => [...contacts].sort((left, right) => {
    if (!left.lastSpokeAt) return -1;
    if (!right.lastSpokeAt) return 1;
    return left.lastSpokeAt.localeCompare(right.lastSpokeAt) || left.displayName.localeCompare(right.displayName);
  }), [contacts]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sourcePeople = event ? attendees : directoryPeople;
  const filteredPeople = useMemo(() => {
    if (!normalizedQuery) return sourcePeople.slice(0, event ? sourcePeople.length : 6);
    return sourcePeople.filter((contact) => searchMatches(contact, normalizedQuery));
  }, [event, normalizedQuery, sourcePeople]);

  const openActions = useMemo(() => sortOpenActions(actions), [actions]);
  const completedActions = useMemo(() => actions
    .filter((action) => action.status === "completed")
    .sort((left, right) => (right.completedAt ?? right.updatedAt)
      .localeCompare(left.completedAt ?? left.updatedAt)), [actions]);
  const actionsByBucket = useMemo(() => Object.fromEntries(bucketOrder.map(({ id }) => [
    id,
    openActions.filter((action) => actionDueBucket(action.dueAt) === id),
  ])) as Record<ActionDueBucket, ActionItem[]>, [openActions]);
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const eventById = useMemo(() => new Map(events.map((item) => [item.id, item])), [events]);
  const recentlyCompleted = recentlyCompletedId
    ? actions.find((action) => action.id === recentlyCompletedId && action.status === "completed")
    : undefined;
  const nextUpcomingEvent = useMemo(() => [...events]
    .filter((item) => !eventHasEnded(item))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0], [events]);
  const activeEventEnded = event ? eventHasEnded(event) : false;

  const addPerson = () => router.push(event
    ? { pathname: "/contact/new", params: { eventId: event.id } }
    : { pathname: "/contact/new", params: { global: "1" } });
  const addFollowUp = () => router.push({
    pathname: "/action/[id]",
    params: { id: "new", ...(event ? { eventId: event.id } : {}) },
  });

  const completeAction = async (action: ActionItem) => {
    setMutationBusyId(action.id);
    setError(undefined);
    try {
      await setActionCompleted(action.id, true);
      setRecentlyCompletedId(action.id);
    } catch {
      setError("Context could not complete this follow-up. Nothing was changed; try again.");
    } finally {
      setMutationBusyId(undefined);
    }
  };

  const undoCompletion = async () => {
    if (!recentlyCompleted) return;
    setMutationBusyId(recentlyCompleted.id);
    setError(undefined);
    try {
      await setActionCompleted(recentlyCompleted.id, false);
      setRecentlyCompletedId(undefined);
    } catch (caught) {
      setError(mutationErrorMessage(
        caught,
        "Context could not reopen this follow-up. It remains completed; try again.",
      ));
    } finally {
      setMutationBusyId(undefined);
    }
  };

  const changeCurrentEvent = async (eventId: string) => {
    setMutationBusyId(`event:${eventId || "none"}`);
    setError(undefined);
    try {
      await setCurrentEventId(eventId);
    } catch {
      setError("Context could not update the event on Today. Try again.");
    } finally {
      setMutationBusyId(undefined);
    }
  };

  const listHeader = (
    <View style={styles.listHeader}>
      <ErrorBanner message={error} />
      {!contacts.length ? (
        <>
          <View style={styles.everydayFeature}>
            <AppText emphasis="semibold" role="footnote" tone="tint">Private relationship memory</AppText>
            <View style={styles.featureCopy}>
              <AppText accessibilityRole="header" emphasis="semibold" role="title2">Who do you want to remember?</AppText>
              <AppText role="callout" tone="secondary">
                Start with someone you would be glad to recognize, remember, or follow up with next time.
              </AppText>
            </View>
            <Button onPress={addPerson} symbol={symbols.plus}>Add a Person</Button>
          </View>

          {Platform.OS !== "web" && !hasSeenContactImportPrompt ? (
            <View style={styles.contactsPrompt}>
              <View style={styles.promptHeading}>
                <View style={styles.promptSymbol}>
                  <AppSymbol name={symbols.import} size={21} tone="tint" weight="semibold" />
                </View>
                <View style={styles.flex}>
                  <AppText emphasis="semibold" role="headline">Or choose from Contacts</AppText>
                  <AppText role="footnote" tone="secondary">
                    You choose exactly who to copy. Context never modifies Contacts.
                  </AppText>
                </View>
              </View>
              <View style={styles.promptActions}>
                <Button
                  onPress={() => {
                    setHasSeenContactImportPrompt(true);
                    router.push("/contacts-import");
                  }}
                  symbol={symbols.import}
                  variant="secondary"
                >
                  Choose Contacts
                </Button>
                <BarButton onPress={() => setHasSeenContactImportPrompt(true)}>Not Now</BarButton>
              </View>
            </View>
          ) : null}

          <ListSection title="Optional Event Tools">
            <ListRow
              accessory="disclosure"
              last
              onPress={() => router.push("/events")}
              subtitle="Prepare a focused list of people before a gathering"
              symbol={symbols.events}
              title="Plan for an Event"
            />
          </ListSection>
        </>
      ) : (
        <>
          <View style={styles.todayIntro}>
            <View style={styles.featureCopy}>
              <AppText accessibilityRole="header" emphasis="semibold" role="title2">People to reconnect with</AppText>
              <AppText role="callout" tone="secondary">Based on follow-ups, events, and how long it’s been.</AppText>
            </View>
            <View style={styles.quickActions}>
              <Button onPress={addFollowUp} symbol={symbols.checkCircle}>Add Follow-up</Button>
              <Button onPress={addPerson} symbol={symbols.plus} variant="secondary">Add Person</Button>
            </View>
          </View>

          {recentlyCompleted ? (
            <View accessibilityRole="alert" style={styles.undoBanner}>
              <AppSymbol name={symbols.checkCircle} size={18} tone="success" />
              <AppText emphasis="medium" role="subheadline" style={styles.flex} tone="success">
                Completed “{recentlyCompleted.title}”
              </AppText>
              <BarButton loading={mutationBusyId === recentlyCompleted.id} onPress={() => { void undoCompletion(); }}>Undo</BarButton>
            </View>
          ) : null}

          {openActions.length ? bucketOrder.map(({ id, title }) => {
            const bucketActions = actionsByBucket[id];
            if (!bucketActions.length) return null;
            return (
              <ListSection key={id} title={title}>
                {bucketActions.map((action, index) => {
                  const person = contactById.get(action.contactId);
                  const linkedEvent = action.eventId ? eventById.get(action.eventId) : undefined;
                  const subtitle = [person?.displayName, linkedEvent?.name].filter(Boolean).join(" · ");
                  return (
                    <ListRow
                      accessibilityHint="Opens this follow-up for editing"
                      accessibilityLabel={`${action.title}. ${subtitle}. ${followUpDetail(action, id)}.`}
                      accessoryNode={(
                        <IconButton
                          accessibilityLabel={`Complete ${action.title}`}
                          loading={mutationBusyId === action.id}
                          onPress={() => { void completeAction(action); }}
                          symbol={symbols.checkCircle}
                          tone={id === "overdue" ? "warning" : "tint"}
                        />
                      )}
                      detail={followUpDetail(action, id)}
                      key={action.id}
                      last={index === bucketActions.length - 1}
                      onPress={() => router.push({ pathname: "/action/[id]", params: { id: action.id } })}
                      {...(subtitle ? { subtitle } : {})}
                      title={action.title}
                    />
                  );
                })}
              </ListSection>
            );
          }) : (
            <View style={styles.caughtUp}>
              <AppSymbol name={symbols.checkCircle} size={22} tone="success" />
              <View style={styles.flex}>
                <AppText emphasis="semibold" role="headline">You’re caught up</AppText>
                <AppText role="footnote" tone="secondary">No open follow-ups. Add one whenever you make a promise or want a reason to reconnect.</AppText>
              </View>
            </View>
          )}

          {completedActions.length ? completedVisibleCount === 0 ? (
            <ListSection title="History">
              <ListRow
                accessory="disclosure"
                detail={`${completedActions.length}`}
                last
                onPress={() => setCompletedVisibleCount(Math.min(50, completedActions.length))}
                subtitle="Reopen, edit, or delete finished follow-ups"
                symbol={symbols.checkCircle}
                title="Completed Follow-ups"
              />
            </ListSection>
          ) : (
            <View style={styles.completedHistory}>
              <View style={styles.sectionHeading}>
                <View style={styles.flex}>
                  <AppText accessibilityRole="header" emphasis="semibold" role="title3">Completed</AppText>
                  <AppText role="footnote" tone="secondary">Open any follow-up to make it active again or delete it.</AppText>
                </View>
                <BarButton onPress={() => setCompletedVisibleCount(0)}>Hide</BarButton>
              </View>
              <ListSection>
                {completedActions.slice(0, completedVisibleCount).map((action, index) => {
                  const person = contactById.get(action.contactId);
                  const linkedEvent = action.eventId ? eventById.get(action.eventId) : undefined;
                  const subtitle = [person?.displayName, linkedEvent?.name].filter(Boolean).join(" · ");
                  return (
                    <ListRow
                      accessibilityHint="Opens this follow-up for editing"
                      accessibilityLabel={`${action.title}. Completed ${displayDate(action.completedAt ?? action.updatedAt)}.`}
                      accessory="disclosure"
                      detail={displayDate(action.completedAt ?? action.updatedAt)}
                      key={action.id}
                      last={index === Math.min(completedVisibleCount, completedActions.length) - 1}
                      onPress={() => router.push({ pathname: "/action/[id]", params: { id: action.id } })}
                      {...(subtitle ? { subtitle } : {})}
                      title={action.title}
                    />
                  );
                })}
              </ListSection>
              {completedVisibleCount < completedActions.length ? (
                <Button
                  onPress={() => setCompletedVisibleCount((current) => Math.min(current + 50, completedActions.length))}
                  variant="secondary"
                >
                  Show More Completed
                </Button>
              ) : null}
            </View>
          ) : null}

          {event ? (
            <View style={[styles.eventFeature, activeEventEnded && styles.endedEventFeature]}>
              <View style={styles.eventTopline}>
                <AppText emphasis="semibold" role="footnote" tone={activeEventEnded ? "warning" : "tint"}>
                  {activeEventEnded ? "This event has ended" : "Showing on Today"}
                </AppText>
                <BarButton loading={mutationBusyId === "event:none"} onPress={() => { void changeCurrentEvent(""); }}>Remove</BarButton>
              </View>
              <View style={styles.featureCopy}>
                <AppText accessibilityRole="header" emphasis="semibold" role="title3">{event.name}</AppText>
                <AppText role="callout" tone="secondary">
                  {displayEventSchedule(event)} · {event.locationLabel ?? "Location not stored"}
                </AppText>
                <AppText emphasis="medium" role="subheadline" tone="secondary">
                  {attendees.length} {attendees.length === 1 ? "person" : "people"} included
                </AppText>
              </View>
              <Button
                onPress={() => router.push("/recognize")}
                symbol={symbols.people}
                variant={activeEventEnded ? "secondary" : "primary"}
              >
                View Event People
              </Button>
            </View>
          ) : nextUpcomingEvent ? (
            <ListSection footer="Show an event on Today when you are ready to prepare." title="Next Event">
              <ListRow
                accessory="disclosure"
                detail={displayEventSchedule(nextUpcomingEvent)}
                last
                onPress={() => { void changeCurrentEvent(nextUpcomingEvent.id); }}
                subtitle="Show on Today"
                symbol={symbols.events}
                title={nextUpcomingEvent.name}
              />
            </ListSection>
          ) : (
            <ListSection title="Event Planning">
              <ListRow
                accessory="disclosure"
                last
                onPress={() => router.push("/events")}
                subtitle="Prepare a focused list of people before a gathering"
                symbol={symbols.events}
                title="Plan for an Event"
              />
            </ListSection>
          )}

          <View style={styles.peopleHeading}>
            <View style={styles.flex}>
              <AppText accessibilityRole="header" emphasis="semibold" role="title3">
                {event ? "People at this event" : "Worth reconnecting"}
              </AppText>
              <AppText role="footnote" tone="secondary">
                {event ? "People with the least recent context appear first" : "People with no recent conversation appear first"}
              </AppText>
            </View>
            <BarButton onPress={() => router.push("/people")}>See All</BarButton>
          </View>

          {sourcePeople.length ? (
            <TextField
              accessibilityLabel={event ? "Search people in this event" : "Search people worth reconnecting with"}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder={event ? "Search this event" : "Search people"}
              value={query}
            />
          ) : null}
        </>
      )}
    </View>
  );

  const listFooter = (
    <View style={styles.listFooter}>
      {contacts.length && !sourcePeople.length ? (
        <EmptyState
          action={event
            ? <Button onPress={() => router.push({ pathname: "/event/[id]/attendees", params: { id: event.id } })} symbol={symbols.people}>Choose People</Button>
            : undefined}
          body={event ? "Choose saved people to include while preparing for this event." : "Add someone you would be glad to remember next time."}
          symbol={symbols.people}
          title={event ? "No people in this event" : "No saved people"}
        />
      ) : null}
      {contacts.length && sourcePeople.length && !filteredPeople.length ? (
        <EmptyState
          action={<Button onPress={() => setQuery("")} variant="secondary">Clear Search</Button>}
          body={`No saved person matches “${query.trim()}”.`}
          symbol={symbols.people}
          title="No matches"
        />
      ) : null}
    </View>
  );

  return (
    <Screen contentContainerStyle={styles.screen} scroll={false}>
      <FlatList
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        data={contacts.length ? filteredPeople : []}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(contact) => contact.id}
        ListFooterComponent={listFooter}
        ListHeaderComponent={listHeader}
        renderItem={({ item: contact, index }) => {
          const metadata = [contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship";
          const refresher = contact.recentUpdate ?? contact.lastDiscussed ?? metadata;
          const lastSpoke = relativeDate(contact.lastSpokeAt) ?? "not recorded";
          const last = index === filteredPeople.length - 1;
          return (
            <View style={[styles.personRowSurface, index === 0 && styles.groupFirst, last && styles.groupLast]}>
              <ListRow
                accessibilityLabel={`Open ${contact.displayName}. ${metadata}. ${refresher}. Last spoke ${lastSpoke}.`}
                accessory="disclosure"
                detail={lastSpoke}
                last={last}
                leading={<Avatar name={contact.displayName} photoUri={contact.photoUri} size={44} />}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })}
                subtitle={refresher}
                title={contact.displayName}
              />
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: 0 },
  list: { flex: 1, width: "100%", backgroundColor: colors.canvas },
  listContent: { flexGrow: 1, paddingBottom: spacing.xxl },
  listHeader: { gap: spacing.xl, marginBottom: spacing.sm },
  listFooter: { gap: spacing.lg, marginTop: spacing.lg },
  flex: { flex: 1, minWidth: 0 },
  featureCopy: { gap: spacing.xs },
  everydayFeature: {
    borderRadius: radius.feature,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  contactsPrompt: {
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.primarySoft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  promptHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  promptSymbol: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  promptActions: { alignItems: "stretch", gap: spacing.xs },
  todayIntro: { gap: spacing.lg },
  quickActions: { gap: spacing.sm },
  undoBanner: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.successSoft,
    paddingLeft: spacing.md,
    gap: spacing.sm,
  },
  caughtUp: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.successSoft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  completedHistory: { gap: spacing.md },
  sectionHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.md },
  eventFeature: {
    borderRadius: radius.feature,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  endedEventFeature: { backgroundColor: colors.warningSoft },
  eventTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  peopleHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.md },
  personRowSurface: { backgroundColor: colors.surface },
  groupFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
  groupLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
});
