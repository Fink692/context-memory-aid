import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Button, EmptyState, Screen, symbols } from "@/components/ui";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function OpenBadgeScreen() {
  const params = useLocalSearchParams<{ badgeId?: string | string[] }>();
  const badgeId = singleParam(params.badgeId);
  const router = useRouter();
  const contact = useAppStore((state) => state.contacts.find((item) => item.badgeId === badgeId));
  const activeEvent = useAppStore((state) => state.events.find((event) => event.id === state.currentEventId));
  const eligible = Boolean(contact?.recognitionEnabled && activeEvent?.attendeeContactIds.includes(contact.id));

  if (contact && eligible) {
    return <Redirect href={{ pathname: "/contact/[id]", params: { id: contact.id, recognized: "1" } }} />;
  }

  return (
    <Screen safeEdges={["top", "right", "bottom", "left"]}>
      <EmptyState
        action={<Button onPress={() => router.replace("/events")}>Choose an Event</Button>}
        body="This badge is not available inside the active event. Context did not search beyond your saved people."
        symbol={symbols.scan}
        title="Badge outside this event"
      />
    </Screen>
  );
}
