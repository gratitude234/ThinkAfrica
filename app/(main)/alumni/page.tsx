import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UserAvatar from "@/components/ui/UserAvatar";

export const metadata = { title: "Alumni - Indegenius" };

interface AlumnusRow {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  avatar_url: string | null;
  open_to_mentoring: boolean;
}

export default async function AlumniPage() {
  const supabase = await createClient();

  const { data: alumni } = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, university, field_of_study, graduation_year, avatar_url, open_to_mentoring"
    )
    .eq("is_alumni", true)
    .order("graduation_year", { ascending: false })
    .limit(60);

  const rows = (alumni ?? []) as AlumnusRow[];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Alumni</h1>
        <p className="mt-1 text-sm text-gray-500">
          Graduates still shaping the conversation.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No alumni yet.</p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {rows.map((alumnus) => (
            <Link
              key={alumnus.id}
              href={`/${alumnus.username}`}
              className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-gray-50"
            >
              <UserAvatar
                name={alumnus.full_name ?? alumnus.username}
                src={alumnus.avatar_url}
                size={44}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {alumnus.full_name ?? alumnus.username}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {alumnus.field_of_study ?? ""}
                  {alumnus.field_of_study && alumnus.university ? " · " : ""}
                  {alumnus.university ?? ""}
                  {alumnus.graduation_year
                    ? ` · '${String(alumnus.graduation_year).slice(-2)}`
                    : ""}
                </p>
              </div>
              {alumnus.open_to_mentoring ? (
                <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                  Mentoring
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
