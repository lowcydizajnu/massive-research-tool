import { ParticipantsComingSoon } from "@/components/feature/participants/coming-soon";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ParticipantsComingSoon
      title="Compensation"
      blurb="Track what you've spent on participants — per study, per month, per currency — mirrored from your provider."
    />
  );
}
