import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/adminAccess";
import { AdminAccessError } from "@/lib/supabase/admin";
import { PrototypeNotice } from "../CommunicationsChrome";
import { loadComposerData } from "../composerData";
import BroadcastComposer from "./BroadcastComposer";

export default async function NewBroadcastPage() {
  let context: Awaited<ReturnType<typeof requireCapability>>;

  try {
    context = await requireCapability("communications.manage");
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) {
      redirect("/login");
    }
    return (
      <div className="mx-auto max-w-2xl py-20 text-center text-sm text-gray-500">
        You do not have permission to send Indegenius communications.
      </div>
    );
  }

  const data = await loadComposerData(context);

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-sm text-gray-500">
          No sending identity is available to your account.
        </p>
        <Link
          href="/admin/communications"
          className="mt-4 inline-flex text-sm font-semibold text-emerald-brand hover:underline"
        >
          Back to Email Broadcasts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PrototypeNotice />
      <BroadcastComposer {...data} />
    </div>
  );
}
