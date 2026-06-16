import { ParticipantsComingSoon } from "@/components/feature/participants/coming-soon";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ParticipantsComingSoon
      title="Quality"
      blurb="Review flagged submissions (attention-check fails, suspicious timing, straight-lining) in one cross-study queue."
    />
  );
}
