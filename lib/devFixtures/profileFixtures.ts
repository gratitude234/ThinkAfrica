import type { ProfileIdentityRecord, ProfilePublicationPage, ProfileDraft } from "@/lib/profileViewData";

// Fictional fixtures consumed only by the production-gated development preview.
export const PROFILE_FIXTURE: ProfileIdentityRecord = {
  id: "fixture-writer", username: "amara", full_name: "Amara Okafor",
  bio: "I write about cities, public life and the everyday decisions that shape our communities. My work explores how people experience institutions, and how thoughtful design can make them more useful. I am interested in practical ideas, careful observation and conversations across disciplines.",
  avatar_url: null, professional_title: "Researcher · Writer", country: "Nigeria",
  university: "University of Lagos", field_of_study: "Urban Studies", graduation_year: 2023,
  interests: ["Governance", "Technology", "Education"], verified: true, verified_type: null,
  organization_website: "https://example.org/", created_at: "2023-09-01T00:00:00Z",
};
export function profileFixturePage(kind: "article" | "post", empty = false): ProfilePublicationPage {
  return {
    kind, page: 1, pageSize: 20, hasPreviousPage: false, hasNextPage: false,
    items: empty ? [] : [0, 1].map(index => ({
      id: `fixture-${kind}-${index}`, slug: `fixture-${kind}-${index}`,
      kind, title: kind === "article" ? ["The city we build together", "What listening can change"][index] : null,
      excerpt: kind === "article" ? ["A closer look at the small decisions that shape the places we call home.", "Public institutions work better when people have a voice in their design."][index]
        : ["A useful question for any new public space: who will feel welcome here, and who will need an invitation?", "Some of the best ideas begin with a walk, a conversation, and enough time to notice what everyone else passes by."][index],
      coverImageUrl: index === 0 ? "/dev-fixtures/cover-emerald.svg" : null,
      publishedAt: "2026-09-20T10:00:00Z", createdAt: "2026-09-20T10:00:00Z", isCoAuthor: false, wordCount: 1000,
    })),
  };
}
export const PROFILE_DRAFT_FIXTURES: ProfileDraft[] = [
  { id: "fixture-draft-1", kind: "article", title: "Making room for public life", updatedAt: "2026-09-21T10:00:00Z" },
  { id: "fixture-draft-2", kind: "article", title: null, updatedAt: "2026-09-20T10:00:00Z" },
  { id: "fixture-draft-3", kind: "post", title: null, excerpt: "A note about the spaces between buildings.", updatedAt: "2026-09-19T10:00:00Z" },
];
