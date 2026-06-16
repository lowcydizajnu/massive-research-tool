import { ParticipantsComingSoon } from "@/components/feature/participants/coming-soon";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ParticipantsComingSoon
      title="Panels"
      blurb="Curate cohorts of past participants by opaque ID to re-recruit or exclude them in new studies."
    />
  );
}
