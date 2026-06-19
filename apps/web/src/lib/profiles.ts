import { supabase } from "@/lib/supabase";

export interface ProfileSummary {
  full_name: string;
  email: string;
}

export async function fetchProfilesByUserIds(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return {} as Record<string, ProfileSummary>;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", uniqueUserIds);

  if (error) throw error;

  return Object.fromEntries(
    (data || []).map((profile) => [
      profile.user_id,
      {
        full_name: profile.full_name,
        email: profile.email,
      },
    ])
  ) as Record<string, ProfileSummary>;
}
