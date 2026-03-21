/**
 * Guest management service — calls Postgres RPC functions (SECURITY DEFINER)
 * so we can create/delete auth users server-side without a service_role key.
 */

import { createAuthClient } from "~/lib/auth.server";

export type GuestRow = {
  id: string;          // student_guest_links.id (UUID)
  guest_id: string;    // auth.users.id (UUID)
  guest_name: string;
  guest_email: string;
  created_at: string;
};

/** List all guests for the authenticated student. */
export async function listGuests(studentId: string, request: Request): Promise<GuestRow[]> {
  const supabase = createAuthClient(request);
  const { data, error } = await supabase.rpc("list_guest_users", {
    p_student_id: studentId,
  });
  if (error) throw new Error(error.message);
  return (data as GuestRow[]) ?? [];
}

/** Create a new guest user. */
export async function createGuest(
  guestName: string,
  guestEmail: string,
  guestPassword: string,
  studentId: string,
  request: Request
): Promise<GuestRow> {
  const supabase = createAuthClient(request);
  const { data, error } = await supabase.rpc("create_guest_user", {
    p_email: guestEmail,
    p_password: guestPassword,
    p_guest_name: guestName,
    p_student_id: studentId,
  });
  if (error) throw new Error(error.message);
  return data as GuestRow;
}

/** Delete a guest by their auth user ID. */
export async function deleteGuest(
  guestId: string,
  studentId: string,
  request: Request
): Promise<void> {
  const supabase = createAuthClient(request);
  const { error } = await supabase.rpc("delete_guest_user", {
    p_guest_id: guestId,
    p_student_id: studentId,
  });
  if (error) throw new Error(error.message);
}
