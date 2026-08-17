"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  RESEARCH_ASSET_TYPES,
  RESEARCH_PROJECT_ROLES,
  RESEARCH_UPDATE_TYPES,
  formatResearchValue,
  getResearchStatusTransitions,
  parseResearchList,
  type ResearchAssetType,
  type ResearchProjectRole,
  type ResearchProjectStatus,
  type ResearchUpdateType,
} from "@/lib/research";
import {
  addExternalResearchAsset,
  addResearchProjectUpdate,
  linkResearchOutput,
  respondToResearchCollaborationRequest,
  sendResearchCollaborationRequest,
  updateResearchProjectStatus,
} from "../../actions";

const INPUT =
  "mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

function FormMessage({ error, notice }: { error: string | null; notice?: string | null }) {
  if (error) return <p role="alert" className="mt-3 text-xs font-medium text-red-700">{error}</p>;
  if (notice) return <p role="status" className="mt-3 text-xs font-medium text-emerald-700">{notice}</p>;
  return null;
}

export function ResearchLifecycleForm({ projectId, status }: { projectId: string; status: ResearchProjectStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const transitions = getResearchStatusTransitions(status);
  if (transitions.length === 0) return null;

  return (
    <form
      className="rounded-xl border border-gray-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await updateResearchProjectStatus({ projectId, status: String(form.get("status")) as ResearchProjectStatus });
          if (result.error) setError(result.error);
          else router.refresh();
        });
      }}
    >
      <h3 className="text-sm font-semibold text-gray-950">Advance lifecycle</h3>
      <p className="mt-1 text-xs leading-5 text-gray-500">Current stage: {formatResearchValue(status)}.</p>
      <div className="mt-3 flex gap-2">
        <select name="status" className={INPUT} aria-label="Next project stage">
          {transitions.map((item) => <option key={item} value={item}>{formatResearchValue(item)}</option>)}
        </select>
        <button disabled={isPending} className="mt-1 min-h-10 shrink-0 rounded-lg bg-gray-950 px-4 text-xs font-semibold text-white disabled:opacity-50">
          {isPending ? "Saving…" : "Move"}
        </button>
      </div>
      <FormMessage error={error} />
    </form>
  );
}

export function CollaborationRequestForm({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <form
      className="rounded-xl border border-emerald-100 bg-emerald-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        setError(null);
        setNotice(null);
        startTransition(async () => {
          const result = await sendResearchCollaborationRequest({
            projectId,
            direction: isOwner ? "invitation" : "join_request",
            recipientUsername: isOwner ? String(form.get("username") ?? "") : null,
            requestedRole: String(form.get("role")) as ResearchProjectRole,
            message: String(form.get("message") ?? ""),
            offeredSkills: parseResearchList(String(form.get("skills") ?? ""), 10),
          });
          if (result.error) {
            setError(result.error);
            return;
          }
          setNotice(isOwner ? "Invitation sent." : "Request sent to the project lead.");
          formElement.reset();
          router.refresh();
        });
      }}
    >
      <h3 className="text-sm font-semibold text-gray-950">{isOwner ? "Invite a collaborator" : "Request to collaborate"}</h3>
      {isOwner ? (
        <label className="mt-3 block text-xs font-semibold text-gray-700">
          Contributor username
          <input name="username" required className={INPUT} placeholder="@username" />
        </label>
      ) : null}
      <label className="mt-3 block text-xs font-semibold text-gray-700">
        Proposed role
        <select name="role" defaultValue="researcher" className={INPUT}>
          {RESEARCH_PROJECT_ROLES.filter((role) => role !== "lead").map((role) => (
            <option key={role} value={role}>{formatResearchValue(role)}</option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-xs font-semibold text-gray-700">
        Concrete contribution
        <textarea name="message" required minLength={10} maxLength={1000} rows={4} className={INPUT} placeholder="Explain the work, evidence, or method you can contribute." />
      </label>
      <label className="mt-3 block text-xs font-semibold text-gray-700">
        Offered skills
        <input name="skills" className={INPUT} placeholder="GIS, interviewing, statistics" />
      </label>
      <button disabled={isPending} className="mt-4 min-h-10 rounded-lg bg-emerald-brand px-4 text-xs font-semibold text-white disabled:opacity-50">
        {isPending ? "Sending…" : isOwner ? "Send invitation" : "Send request"}
      </button>
      <FormMessage error={error} notice={notice} />
    </form>
  );
}

export interface ResearchRequestView {
  id: string;
  direction: string;
  requested_role: string;
  message: string;
  offered_skills: string[];
  sender: { username: string; full_name: string | null } | null;
}

export function CollaborationRequestsPanel({ requests }: { requests: ResearchRequestView[] }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (requests.length === 0) return null;

  const respond = async (requestId: string, accept: boolean) => {
    setSavingId(requestId);
    setError(null);
    const result = await respondToResearchCollaborationRequest({ requestId, accept });
    if (result.error) setError(result.error);
    else router.refresh();
    setSavingId(null);
  };

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="text-base font-semibold text-gray-950">Collaboration requests</h2>
      <div className="mt-3 space-y-3">
        {requests.map((request) => (
          <article key={request.id} className="rounded-lg border border-amber-100 bg-white p-4">
            <p className="text-sm font-semibold text-gray-900">{request.sender?.full_name ?? request.sender?.username ?? "Researcher"}</p>
            <p className="mt-1 text-xs font-medium text-emerald-700">{formatResearchValue(request.requested_role)}</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">{request.message}</p>
            {request.offered_skills.length > 0 ? <p className="mt-2 text-xs text-gray-500">Skills: {request.offered_skills.join(", ")}</p> : null}
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={savingId === request.id} onClick={() => void respond(request.id, true)} className="rounded-lg bg-emerald-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Accept</button>
              <button type="button" disabled={savingId === request.id} onClick={() => void respond(request.id, false)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">Decline</button>
            </div>
          </article>
        ))}
      </div>
      <FormMessage error={error} />
    </section>
  );
}

export function ResearchUpdateForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <form
      className="rounded-xl border border-gray-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        setError(null);
        setNotice(null);
        startTransition(async () => {
          const result = await addResearchProjectUpdate({
            projectId,
            updateType: String(form.get("updateType")) as ResearchUpdateType,
            title: String(form.get("title") ?? ""),
            body: String(form.get("body") ?? ""),
            visibility: String(form.get("visibility")) as "public" | "members",
          });
          if (result.error) setError(result.error);
          else {
            setNotice("Research update published.");
            formElement.reset();
            router.refresh();
          }
        });
      }}
    >
      <h3 className="text-sm font-semibold text-gray-950">Publish a project update</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <select name="updateType" className={INPUT} aria-label="Update type">
          {RESEARCH_UPDATE_TYPES.map((type) => <option key={type} value={type}>{formatResearchValue(type)}</option>)}
        </select>
        <select name="visibility" className={INPUT} aria-label="Update visibility">
          <option value="public">Public</option>
          <option value="members">Project members</option>
        </select>
      </div>
      <input name="title" required minLength={3} maxLength={160} className={INPUT} placeholder="What changed?" aria-label="Update title" />
      <textarea name="body" required minLength={10} maxLength={4000} rows={4} className={INPUT} placeholder="Record the finding, milestone, challenge, or field note." aria-label="Update details" />
      <button disabled={isPending} className="mt-3 min-h-10 rounded-lg bg-gray-950 px-4 text-xs font-semibold text-white disabled:opacity-50">{isPending ? "Publishing…" : "Publish update"}</button>
      <FormMessage error={error} notice={notice} />
    </form>
  );
}

export function ResearchAssetForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <form
      className="rounded-xl border border-gray-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        setError(null);
        setNotice(null);
        startTransition(async () => {
          try {
            if (mode === "upload") {
              const file = form.get("file");
              if (!(file instanceof File) || file.size === 0) {
                setError("Choose a research file to upload.");
                return;
              }

              const ticketResponse = await fetch("/api/research-project-assets/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectId,
                  title: String(form.get("title") ?? ""),
                  description: String(form.get("description") ?? ""),
                  visibility: String(form.get("visibility") ?? "public"),
                  mimeType: file.type,
                  sizeBytes: file.size,
                }),
              });
              const ticket = (await ticketResponse.json().catch(() => null)) as
                | {
                    assetId?: string;
                    storagePath?: string;
                    token?: string;
                    error?: string;
                  }
                | null;
              if (
                !ticketResponse.ok ||
                !ticket?.assetId ||
                !ticket.storagePath ||
                !ticket.token
              ) {
                setError(ticket?.error ?? "Unable to prepare the research upload.");
                return;
              }

              const cleanupPendingUpload = () =>
                fetch("/api/research-project-assets/upload", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ assetId: ticket.assetId }),
                }).catch(() => null);
              const supabase = createClient();
              const { error: uploadError } = await supabase.storage
                .from("research-project-assets")
                .uploadToSignedUrl(ticket.storagePath, ticket.token, file, {
                  contentType: file.type,
                  upsert: false,
                });
              if (uploadError) {
                await cleanupPendingUpload();
                setError(uploadError.message);
                return;
              }

              const finalizeResponse = await fetch(
                "/api/research-project-assets/upload",
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ assetId: ticket.assetId }),
                }
              );
              const finalized = (await finalizeResponse.json().catch(() => null)) as
                | { error?: string }
                | null;
              if (!finalizeResponse.ok) {
                await cleanupPendingUpload();
                setError(finalized?.error ?? "Unable to verify the research upload.");
                return;
              }
            } else {
              const result = await addExternalResearchAsset({
                projectId,
                assetType: String(form.get("assetType")) as ResearchAssetType,
                title: String(form.get("title") ?? ""),
                description: String(form.get("description") ?? ""),
                externalUrl: String(form.get("externalUrl") ?? ""),
                visibility: String(form.get("visibility")) as "public" | "members",
              });
              if (result.error) {
                setError(result.error);
                return;
              }
            }
          } catch {
            setError("The research asset could not be uploaded. Check your connection and try again.");
            return;
          }
          setNotice(mode === "upload" ? "File added to the project." : "Resource link added.");
          formElement.reset();
          router.refresh();
        });
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-950">Add multimedia or data</h3>
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs font-semibold">
          <button type="button" aria-pressed={mode === "upload"} onClick={() => setMode("upload")} className={`min-h-9 rounded-md px-3 py-1 ${mode === "upload" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"}`}>Upload</button>
          <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")} className={`min-h-9 rounded-md px-3 py-1 ${mode === "link" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"}`}>Link</button>
        </div>
      </div>
      <input name="title" required minLength={3} maxLength={160} className={INPUT} placeholder="Asset title" aria-label="Asset title" />
      <textarea name="description" maxLength={1000} rows={2} className={INPUT} placeholder="What this evidence contains" aria-label="Asset description" />
      {mode === "upload" ? (
        <input name="file" type="file" required className={INPUT} aria-label="Research file" />
      ) : (
        <>
          <select name="assetType" defaultValue="external_link" className={INPUT} aria-label="Asset type">
            {RESEARCH_ASSET_TYPES.map((type) => <option key={type} value={type}>{formatResearchValue(type)}</option>)}
          </select>
          <input name="externalUrl" type="url" required className={INPUT} placeholder="https://…" aria-label="External resource URL" />
        </>
      )}
      <select name="visibility" defaultValue="public" className={INPUT} aria-label="Asset visibility">
        <option value="public">Public</option>
        <option value="members">Project members</option>
      </select>
      <button disabled={isPending} className="mt-3 min-h-10 rounded-lg bg-gray-950 px-4 text-xs font-semibold text-white disabled:opacity-50">{isPending ? "Adding…" : "Add asset"}</button>
      <FormMessage error={error} notice={notice} />
    </form>
  );
}

export function LinkResearchOutputForm({ projectId, posts }: { projectId: string; posts: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (posts.length === 0) return null;
  return (
    <form
      className="rounded-xl border border-gray-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await linkResearchOutput({ projectId, postId: String(form.get("postId")) });
          if (result.error) setError(result.error);
          else router.refresh();
        });
      }}
    >
      <h3 className="text-sm font-semibold text-gray-950">Link a reviewed output</h3>
      <select name="postId" className={INPUT} aria-label="Published research output">
        {posts.map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}
      </select>
      <button disabled={isPending} className="mt-3 min-h-10 rounded-lg bg-emerald-brand px-4 text-xs font-semibold text-white disabled:opacity-50">{isPending ? "Linking…" : "Link output"}</button>
      <FormMessage error={error} />
    </form>
  );
}
