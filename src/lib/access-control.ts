/**
 * Shared server-side access gates.
 *
 * These check the DB directly (via the caller's own RLS-scoped client) so
 * they hold regardless of what the UI shows — a hidden button or a
 * client-side redirect is not a security boundary, this is.
 */

type MemberCheckContext = {
  supabase: { from: (table: string) => any };
  userId: string;
};

/**
 * Throws unless the caller holds `member`, `admin`, or `super_admin`.
 * Call this at the top of any handler that moves wallet balance (bet
 * placement, arcade stake/settle, wallet debits) — signing up does not by
 * itself grant permission to wager, an admin still has to approve the
 * account first, and that has to be enforced here, not just hidden in the
 * UI behind a "pending approval" screen.
 */
export async function requireApprovedMember(context: MemberCheckContext): Promise<void> {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const isMember = (roles ?? []).some(
    (r: { role: string }) => r.role === "member" || r.role === "admin" || r.role === "super_admin",
  );
  if (!isMember) throw new Error("Your account isn't approved yet.");
}
