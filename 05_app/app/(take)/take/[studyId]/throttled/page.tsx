import { Card } from "@/components/feature/take/parts";

/**
 * Shown when a participant trips the begin-rate-limit on `/take/*` (security
 * review #9). A calm, non-accusatory wait message — a real participant who
 * refreshed a couple of times lands here and just waits a moment.
 */
export default function ThrottledPage() {
  return (
    <Card>
      <h1 className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
        One moment
      </h1>
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        You’re starting a little fast. Please wait about a minute, then refresh this page to
        continue.
      </p>
    </Card>
  );
}
