export async function assertReferralAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some(
    (row: any) => row.role === "admin" || row.role === "super_admin",
  );
  if (!isAdmin) throw new Error("Forbidden");
}