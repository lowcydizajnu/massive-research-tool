import { ParticipantsComingSoon } from "@/components/feature/participants/coming-soon";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ParticipantsComingSoon
      title="Open recruitment"
      blurb="See provider-side recruitment across your studies — submissions in flight, the approval queue, and spend so far."
    />
  );
}
