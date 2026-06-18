import { PersonalTabs } from "@/components/chrome/personal-tabs";
import { PersonalTopBar } from "@/components/chrome/personal-top-bar";
import { auth } from "@/server/adapters/auth";

/**
 * Personal mode (IA v0.5, ADR-0033) — the third chrome variant alongside
 * `(workspace)` and `(study)`. Slim top bar, no LeftRail; holds the
 * cross-workspace `/home`. The `(app)` parent already guards onboarding +
 * providers; this group only swaps the chrome.
 */
function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export const dynamic = "force-dynamic";

export default async function PersonalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await auth.getCurrentUser();
  const initials = user ? initialsFrom(user.displayName, user.email) : "··";

  return (
    <>
      <PersonalTopBar
        userInitials={initials}
        displayName={user?.displayName ?? null}
        email={user?.email ?? null}
      />
      <PersonalTabs />
      <div className="flex flex-1 flex-col gap-3 p-3">{children}</div>
    </>
  );
}
