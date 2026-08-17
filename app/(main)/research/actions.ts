"use server";

import { revalidatePath } from "next/cache";
import { recordActivationEvent } from "@/lib/activationServer";
import { buildSlugFromTitle } from "@/lib/postSlug";
import {
  RESEARCH_ASSET_TYPES,
  RESEARCH_COLLABORATION_STATUSES,
  RESEARCH_PROJECT_ROLES,
  RESEARCH_PROJECT_STATUSES,
  RESEARCH_UPDATE_TYPES,
  canTransitionResearchStatus,
  isSafeResearchUrl,
  normalizeResearchList,
  type ResearchAssetType,
  type ResearchCollaborationStatus,
  type ResearchProjectRole,
  type ResearchProjectStatus,
  type ResearchUpdateType,
} from "@/lib/research";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ActionResult = { error: string | null };

function cleanText(value: string, min: number, max: number) {
  const cleaned = value.trim().replace(/\r\n/g, "\n");
  return cleaned.length >= min && cleaned.length <= max ? cleaned : null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function authenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createResearchProposal(input: {
  title: string;
  summary: string;
  researchQuestion: string;
  methodology: string;
  expectedOutput: string;
  disciplines: string[];
  skillsNeeded: string[];
  targetCompletionDate?: string | null;
  visibility: "public" | "members" | "private";
  recruitCollaborators: boolean;
}): Promise<ActionResult & { slug: string | null }> {
  try {
    const title = cleanText(input.title, 5, 160);
    const summary = cleanText(input.summary, 30, 1000);
    const researchQuestion = cleanText(input.researchQuestion, 10, 500);
    const methodology = cleanText(input.methodology, 10, 1500);
    const expectedOutput = cleanText(input.expectedOutput, 5, 300);
    const disciplines = normalizeResearchList(input.disciplines, 10);
    const skillsNeeded = normalizeResearchList(input.skillsNeeded, 12);

    if (!title || !summary || !researchQuestion || !methodology || !expectedOutput) {
      return { error: "Complete each required proposal field within its character limit.", slug: null };
    }
    if (disciplines.length === 0) {
      return { error: "Add at least one research discipline.", slug: null };
    }
    if (!["public", "members", "private"].includes(input.visibility)) {
      return { error: "Choose a valid project visibility.", slug: null };
    }
    if (
      input.targetCompletionDate &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(input.targetCompletionDate) ||
        Number.isNaN(Date.parse(input.targetCompletionDate)))
    ) {
      return { error: "Choose a valid target completion date.", slug: null };
    }

    const { supabase, user } = await authenticatedClient();
    if (!user) return { error: "You must be signed in.", slug: null };

    const suffix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
    const slug = buildSlugFromTitle(title, "research-project", suffix);
    const status = input.recruitCollaborators ? "recruiting" : "proposal";
    const { data, error } = await supabase
      .from("research_projects")
      .insert({
        owner_id: user.id,
        slug,
        title,
        summary,
        research_question: researchQuestion,
        methodology,
        expected_output: expectedOutput,
        disciplines,
        skills_needed: skillsNeeded,
        target_completion_date: input.targetCompletionDate || null,
        visibility: input.visibility,
        status,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { error: error?.message ?? "Unable to create the research proposal.", slug: null };
    }

    await recordActivationEvent({
      supabase,
      event: "research_proposal_created",
      userId: user.id,
      source: "server_action",
      route: "/research/proposals/new",
      metadata: { projectId: data.id, status, visibility: input.visibility },
    });
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    revalidatePath("/research");
    if (profile?.username) revalidatePath(`/${profile.username}`);
    return { error: null, slug };
  } catch (error) {
    return { error: errorMessage(error, "Unable to create the research proposal."), slug: null };
  }
}

export async function updateResearchProjectStatus(input: {
  projectId: string;
  status: ResearchProjectStatus;
}): Promise<ActionResult> {
  try {
    if (!UUID_PATTERN.test(input.projectId) || !RESEARCH_PROJECT_STATUSES.includes(input.status)) {
      return { error: "Choose a valid project status." };
    }
    const { supabase, user } = await authenticatedClient();
    if (!user) return { error: "You must be signed in." };

    const { data: project } = await supabase
      .from("research_projects")
      .select("slug, owner_id, status")
      .eq("id", input.projectId)
      .maybeSingle();
    if (!project || project.owner_id !== user.id) {
      return { error: "Only the project lead can change its lifecycle stage." };
    }
    if (
      !RESEARCH_PROJECT_STATUSES.includes(project.status as ResearchProjectStatus) ||
      !canTransitionResearchStatus(project.status as ResearchProjectStatus, input.status)
    ) {
      return { error: `The project cannot move from ${project.status} to ${input.status}.` };
    }

    const { error } = await supabase
      .from("research_projects")
      .update({ status: input.status })
      .eq("id", input.projectId)
      .eq("owner_id", user.id);
    if (error) return { error: error.message };

    await recordActivationEvent({
      supabase,
      event: "research_project_status_changed",
      userId: user.id,
      source: "server_action",
      route: `/research/projects/${project.slug}`,
      metadata: { projectId: input.projectId, from: project.status, to: input.status },
    });
    revalidatePath("/research");
    revalidatePath(`/research/projects/${project.slug}`);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, "Unable to update the project stage.") };
  }
}

export async function sendResearchCollaborationRequest(input: {
  projectId: string;
  direction: "join_request" | "invitation";
  requestedRole: ResearchProjectRole;
  message: string;
  offeredSkills: string[];
  recipientUsername?: string | null;
}): Promise<ActionResult> {
  try {
    if (!UUID_PATTERN.test(input.projectId)) return { error: "Invalid research project." };
    if (!["join_request", "invitation"].includes(input.direction)) {
      return { error: "Choose a valid collaboration request type." };
    }
    if (input.requestedRole === "lead" || !RESEARCH_PROJECT_ROLES.includes(input.requestedRole)) {
      return { error: "Choose a valid collaboration role." };
    }
    const message = cleanText(input.message, 10, 1000);
    if (!message) return { error: "Explain the concrete contribution in 10 to 1,000 characters." };
    const offeredSkills = normalizeResearchList(input.offeredSkills, 10);

    const { supabase, user } = await authenticatedClient();
    if (!user) return { error: "You must be signed in." };

    let recipientId: string | null = null;
    if (input.direction === "invitation") {
      const username = input.recipientUsername?.trim().replace(/^@/, "") ?? "";
      if (!username) return { error: "Enter the collaborator's username." };
      const { data: recipient } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .maybeSingle();
      if (!recipient) return { error: "No contributor was found with that username." };
      recipientId = recipient.id;
    }

    const { error } = await supabase.rpc("create_research_collaboration_request", {
      p_project_id: input.projectId,
      p_direction: input.direction,
      p_requested_role: input.requestedRole,
      p_message: message,
      p_offered_skills: offeredSkills,
      p_recipient_id: recipientId,
    });
    if (error) {
      return {
        error:
          error.code === "23505"
            ? "A pending collaboration request already exists."
            : error.message,
      };
    }

    revalidatePath("/research");
    revalidatePath("/notifications");
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, "Unable to send the collaboration request.") };
  }
}

export async function respondToResearchCollaborationRequest(input: {
  requestId: string;
  accept: boolean;
}): Promise<ActionResult> {
  try {
    if (!UUID_PATTERN.test(input.requestId)) return { error: "Invalid collaboration request." };
    const { supabase, user } = await authenticatedClient();
    if (!user) return { error: "You must be signed in." };

    const { data: slug, error } = await supabase.rpc(
      "respond_research_collaboration_request",
      { p_request_id: input.requestId, p_accept: input.accept }
    );
    if (error) return { error: error.message };

    revalidatePath("/research");
    revalidatePath("/notifications");
    if (typeof slug === "string") revalidatePath(`/research/projects/${slug}`);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, "Unable to resolve the collaboration request.") };
  }
}

export async function addResearchProjectUpdate(input: {
  projectId: string;
  updateType: ResearchUpdateType;
  title: string;
  body: string;
  visibility: "public" | "members";
}): Promise<ActionResult> {
  try {
    if (!UUID_PATTERN.test(input.projectId) || !RESEARCH_UPDATE_TYPES.includes(input.updateType)) {
      return { error: "Choose a valid research update type." };
    }
    const title = cleanText(input.title, 3, 160);
    const body = cleanText(input.body, 10, 4000);
    if (!title || !body || !["public", "members"].includes(input.visibility)) {
      return { error: "Complete the update and choose a valid visibility." };
    }
    const { supabase, user } = await authenticatedClient();
    if (!user) return { error: "You must be signed in." };

    const { error } = await supabase.from("research_project_updates").insert({
      project_id: input.projectId,
      author_id: user.id,
      update_type: input.updateType,
      title,
      body,
      visibility: input.visibility,
    });
    if (error) return { error: error.message };

    const { data: project } = await supabase
      .from("research_projects")
      .select("slug")
      .eq("id", input.projectId)
      .maybeSingle();

    await recordActivationEvent({
      supabase,
      event: "research_update_published",
      userId: user.id,
      source: "server_action",
      route: "/research",
      metadata: { projectId: input.projectId, updateType: input.updateType, visibility: input.visibility },
    });
    revalidatePath("/research");
    if (project?.slug) revalidatePath(`/research/projects/${project.slug}`);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, "Unable to publish the research update.") };
  }
}

export async function addExternalResearchAsset(input: {
  projectId: string;
  assetType: ResearchAssetType;
  title: string;
  description?: string | null;
  externalUrl: string;
  visibility: "public" | "members";
}): Promise<ActionResult> {
  try {
    if (!UUID_PATTERN.test(input.projectId) || !RESEARCH_ASSET_TYPES.includes(input.assetType)) {
      return { error: "Choose a valid research asset type." };
    }
    const title = cleanText(input.title, 3, 160);
    const description = input.description?.trim() ?? "";
    if (!title || description.length > 1000 || !isSafeResearchUrl(input.externalUrl)) {
      return { error: "Add a title and a valid HTTPS resource link." };
    }
    if (!["public", "members"].includes(input.visibility)) {
      return { error: "Choose a valid asset visibility." };
    }
    const { supabase, user } = await authenticatedClient();
    if (!user) return { error: "You must be signed in." };

    const { error } = await supabase.from("research_project_assets").insert({
      project_id: input.projectId,
      uploaded_by: user.id,
      asset_type: input.assetType,
      title,
      description: description || null,
      external_url: input.externalUrl.trim(),
      visibility: input.visibility,
    });
    if (error) return { error: error.message };

    const { data: project } = await supabase
      .from("research_projects")
      .select("slug")
      .eq("id", input.projectId)
      .maybeSingle();

    await recordActivationEvent({
      supabase,
      event: "research_asset_added",
      userId: user.id,
      source: "server_action",
      route: "/research",
      metadata: { projectId: input.projectId, assetType: input.assetType, storage: false },
    });
    revalidatePath("/research");
    if (project?.slug) revalidatePath(`/research/projects/${project.slug}`);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, "Unable to add the research asset.") };
  }
}

export async function linkResearchOutput(input: {
  projectId: string;
  postId: string;
}): Promise<ActionResult> {
  try {
    if (!UUID_PATTERN.test(input.projectId) || !UUID_PATTERN.test(input.postId)) {
      return { error: "Choose a valid research output." };
    }
    const { supabase, user } = await authenticatedClient();
    if (!user) return { error: "You must be signed in." };
    const { data: project } = await supabase
      .from("research_projects")
      .select("slug, owner_id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (!project || project.owner_id !== user.id) {
      return { error: "Only the project lead can link its final output." };
    }
    const { error } = await supabase
      .from("research_projects")
      .update({ linked_post_id: input.postId })
      .eq("id", input.projectId)
      .eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/research");
    revalidatePath(`/research/projects/${project.slug}`);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, "Unable to link the research output.") };
  }
}

export async function updateResearcherProfile(input: {
  headline?: string | null;
  overview?: string | null;
  researchInterests: string[];
  methods: string[];
  collaborationStatus: ResearchCollaborationStatus;
  preferredRoles: string[];
  orcidUrl?: string | null;
  websiteUrl?: string | null;
}): Promise<ActionResult> {
  try {
    const headline = input.headline?.trim() ?? "";
    const overview = input.overview?.trim() ?? "";
    const interests = normalizeResearchList(input.researchInterests, 20);
    const methods = normalizeResearchList(input.methods, 20);
    const preferredRoles = normalizeResearchList(input.preferredRoles, 7).filter((role) =>
      RESEARCH_PROJECT_ROLES.includes(role as ResearchProjectRole)
    );
    const orcidUrl = input.orcidUrl?.trim() ?? "";
    const websiteUrl = input.websiteUrl?.trim() ?? "";

    if ((headline && (headline.length < 3 || headline.length > 160)) || overview.length > 1500) {
      return { error: "Keep the headline and overview within their character limits." };
    }
    if (!RESEARCH_COLLABORATION_STATUSES.includes(input.collaborationStatus)) {
      return { error: "Choose a valid collaboration status." };
    }
    if (
      orcidUrl &&
      !/^https:\/\/orcid\.org\/[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$/.test(
        orcidUrl
      )
    ) {
      return { error: "Use your full HTTPS ORCID profile URL." };
    }
    if (websiteUrl && !isSafeResearchUrl(websiteUrl)) {
      return { error: "Use a valid HTTPS research website URL." };
    }

    const { supabase, user } = await authenticatedClient();
    if (!user) return { error: "You must be signed in." };
    const { error } = await supabase.from("researcher_profiles").upsert(
      {
        user_id: user.id,
        headline: headline || null,
        overview: overview || null,
        research_interests: interests,
        methods,
        collaboration_status: input.collaborationStatus,
        preferred_roles: preferredRoles,
        orcid_url: orcidUrl || null,
        website_url: websiteUrl || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) return { error: error.message };

    await recordActivationEvent({
      supabase,
      event: "research_profile_updated",
      userId: user.id,
      source: "server_action",
      route: "/research/profile",
      metadata: { collaborationStatus: input.collaborationStatus },
    });
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    revalidatePath("/research");
    revalidatePath("/research/profile");
    if (profile?.username) revalidatePath(`/${profile.username}`);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, "Unable to update the research profile.") };
  }
}
