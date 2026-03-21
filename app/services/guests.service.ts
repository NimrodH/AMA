/**
 * Guest management service — calls the manage-guest Edge Function
 * which uses service_role to create/delete auth users.
 */

const SUPABASE_URL = process.env.SUPABASE_PROJECT_URL ?? "";
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/manage-guest`;

export type GuestRow = {
  id: string;
  guest_id: string;
  guest_name: string;
  guest_email: string;
  created_at: string;
};

async function callEdgeFunction(
  body: Record<string, unknown>,
  accessToken: string
): Promise<unknown> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `Edge function error ${res.status}`);
  }
  return json;
}

/** List all guests for the authenticated student. */
export async function listGuests(accessToken: string): Promise<GuestRow[]> {
  const data = (await callEdgeFunction({ action: "list" }, accessToken)) as {
    guests: GuestRow[];
  };
  return data.guests ?? [];
}

/** Create a new guest user. */
export async function createGuest(
  guestName: string,
  guestEmail: string,
  guestPassword: string,
  accessToken: string
): Promise<GuestRow> {
  const data = (await callEdgeFunction(
    { action: "create", guest_name: guestName, guest_email: guestEmail, guest_password: guestPassword },
    accessToken
  )) as GuestRow & { ok: boolean };
  return data;
}

/** Delete a guest by their auth user ID. */
export async function deleteGuest(guestId: string, accessToken: string): Promise<void> {
  await callEdgeFunction({ action: "delete", guest_id: guestId }, accessToken);
}
