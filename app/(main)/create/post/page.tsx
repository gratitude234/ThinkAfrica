import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostComposerForm from "./PostComposerForm";

export default async function CreatePostPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/create/post");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <PostComposerForm userId={user.id} />
    </div>
  );
}
