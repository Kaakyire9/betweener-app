import { supabase } from "@/lib/supabase";

export type UserPresenceRow = {
  user_id: string;
  online?: boolean | null;
  last_active?: string | null;
  updated_at?: string | null;
};

export const overlayPresence = <
  TRow extends {
    user_id?: string | null;
    online?: boolean | null;
    last_active?: string | null;
  },
>(
  row: TRow,
  presence?: UserPresenceRow | null,
): TRow => {
  if (!presence) return row;
  return {
    ...row,
    online: typeof presence.online === 'boolean' ? presence.online : row.online ?? null,
    last_active: presence.last_active ?? row.last_active ?? null,
  };
};

export const setCurrentUserPresence = async (online: boolean) => {
  return supabase.rpc('rpc_set_user_presence' as never, {
    p_online: online,
  } as never);
};

export const fetchUserPresence = async (userId: string) => {
  return supabase
    .from('user_presence' as never)
    .select('user_id,online,last_active,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
};

export const fetchUsersPresence = async (userIds: string[]) => {
  const uniqueUserIds = Array.from(new Set(userIds.filter((value) => typeof value === 'string' && value.length > 0)));
  if (uniqueUserIds.length === 0) {
    return {
      data: [] as UserPresenceRow[],
      error: null,
    };
  }

  const { data, error } = await supabase
    .from('user_presence' as never)
    .select('user_id,online,last_active,updated_at')
    .in('user_id', uniqueUserIds);

  return {
    data: ((data as UserPresenceRow[] | null) ?? []),
    error,
  };
};
