BEGIN;

CREATE OR REPLACE FUNCTION public.is_valid_research_text_array(
  values_to_check text[],
  max_items integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT cardinality(coalesce(values_to_check, '{}')) <= max_items
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(coalesce(values_to_check, '{}')) AS value
      WHERE char_length(btrim(value)) NOT BETWEEN 1 AND 80
    );
$$;

REVOKE ALL ON FUNCTION public.is_valid_research_text_array(text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_research_text_array(text[], integer)
  TO anon, authenticated, service_role;

-- Phase 4 extends the existing reviewed-research publication path backwards
-- into structured inquiry. Projects are the durable unit; a reviewed post can
-- be linked later as an output without weakening the existing editorial flow.
CREATE TABLE IF NOT EXISTS public.researcher_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  headline text CHECK (headline IS NULL OR char_length(btrim(headline)) BETWEEN 3 AND 160),
  overview text CHECK (overview IS NULL OR char_length(btrim(overview)) <= 1500),
  research_interests text[] NOT NULL DEFAULT '{}',
  methods text[] NOT NULL DEFAULT '{}',
  collaboration_status text NOT NULL DEFAULT 'selective'
    CHECK (collaboration_status IN ('open', 'selective', 'not_open')),
  preferred_roles text[] NOT NULL DEFAULT '{}',
  orcid_url text CHECK (
    orcid_url IS NULL
    OR orcid_url ~ '^https://orcid[.]org/[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$'
  ),
  website_url text CHECK (
    website_url IS NULL
    OR (char_length(website_url) <= 2000 AND website_url ~ '^https://')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (public.is_valid_research_text_array(research_interests, 20)),
  CHECK (public.is_valid_research_text_array(methods, 20)),
  CHECK (public.is_valid_research_text_array(preferred_roles, 7)),
  CHECK (preferred_roles <@ ARRAY[
    'researcher', 'data_analyst', 'field_researcher', 'writer',
    'advisor', 'contributor'
  ]::text[])
);

CREATE TABLE IF NOT EXISTS public.research_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 160),
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 30 AND 1000),
  research_question text NOT NULL
    CHECK (char_length(btrim(research_question)) BETWEEN 10 AND 500),
  methodology text NOT NULL CHECK (char_length(btrim(methodology)) BETWEEN 10 AND 1500),
  expected_output text NOT NULL
    CHECK (char_length(btrim(expected_output)) BETWEEN 5 AND 300),
  disciplines text[] NOT NULL DEFAULT '{}',
  skills_needed text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'proposal'
    CHECK (status IN ('proposal', 'recruiting', 'active', 'analysis', 'writing', 'completed', 'archived')),
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'members', 'private')),
  target_completion_date date,
  linked_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(disciplines) >= 1),
  CHECK (public.is_valid_research_text_array(disciplines, 10)),
  CHECK (public.is_valid_research_text_array(skills_needed, 12))
);

CREATE INDEX IF NOT EXISTS research_projects_public_status_idx
  ON public.research_projects (status, updated_at DESC)
  WHERE visibility = 'public' AND status <> 'archived';
CREATE INDEX IF NOT EXISTS research_projects_owner_status_idx
  ON public.research_projects (owner_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS research_projects_disciplines_idx
  ON public.research_projects USING gin (disciplines);

CREATE TABLE IF NOT EXISTS public.research_project_members (
  project_id uuid NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('lead', 'researcher', 'data_analyst', 'field_researcher', 'writer', 'advisor', 'contributor')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  PRIMARY KEY (project_id, user_id),
  CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS research_project_members_user_status_idx
  ON public.research_project_members (user_id, status, joined_at DESC);

CREATE TABLE IF NOT EXISTS public.research_collaboration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('join_request', 'invitation')),
  requested_role text NOT NULL
    CHECK (requested_role IN ('researcher', 'data_analyst', 'field_researcher', 'writer', 'advisor', 'contributor')),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 10 AND 1000),
  offered_skills text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (sender_id <> recipient_id),
  CHECK (public.is_valid_research_text_array(offered_skills, 10)),
  CHECK ((status = 'pending') = (responded_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS research_collaboration_requests_pending_idx
  ON public.research_collaboration_requests (project_id, sender_id, recipient_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS research_collaboration_requests_recipient_idx
  ON public.research_collaboration_requests (recipient_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.research_project_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  update_type text NOT NULL
    CHECK (update_type IN ('progress', 'milestone', 'finding', 'challenge', 'field_note')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 4000),
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'members')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_project_updates_project_date_idx
  ON public.research_project_updates (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.research_project_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL
    CHECK (event_type IN ('project_created', 'status_changed', 'member_joined', 'member_removed', 'output_linked')),
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_project_events_project_date_idx
  ON public.research_project_events (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.research_project_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_type text NOT NULL
    CHECK (asset_type IN ('image', 'audio', 'video', 'dataset', 'document', 'external_link')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  description text CHECK (description IS NULL OR char_length(btrim(description)) <= 1000),
  storage_path text,
  external_url text,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 52428800),
  upload_status text NOT NULL DEFAULT 'ready'
    CHECK (upload_status IN ('pending', 'ready')),
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'members')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((storage_path IS NULL) <> (external_url IS NULL)),
  CHECK (external_url IS NULL OR upload_status = 'ready'),
  CHECK (
    storage_path IS NULL
    OR (
      storage_path ~ '^projects/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.[a-z0-9]+$'
      AND split_part(storage_path, '/', 2) = project_id::text
      AND split_part(storage_path, '/', 3) = uploaded_by::text
    )
  ),
  CHECK (
    external_url IS NULL
    OR (char_length(external_url) <= 2000 AND external_url ~ '^https://')
  )
);

CREATE INDEX IF NOT EXISTS research_project_assets_project_date_idx
  ON public.research_project_assets (project_id, created_at DESC);

-- The operating team owns the definition of "sufficient". All targets start
-- NULL so product code cannot turn an arbitrary number into an exit gate.
CREATE TABLE IF NOT EXISTS public.research_expansion_targets (
  scope text PRIMARY KEY DEFAULT 'global' CHECK (scope = 'global'),
  window_days integer NOT NULL DEFAULT 90 CHECK (window_days BETWEEN 30 AND 365),
  proposals_created_target integer CHECK (proposals_created_target > 0),
  active_projects_target integer CHECK (active_projects_target > 0),
  accepted_collaborations_target integer CHECK (accepted_collaborations_target > 0),
  completed_projects_target integer CHECK (completed_projects_target > 0),
  public_updates_target integer CHECK (public_updates_target > 0),
  multimedia_assets_target integer CHECK (multimedia_assets_target > 0),
  measurement_started_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.research_expansion_targets (scope)
VALUES ('global')
ON CONFLICT (scope) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_research_project(target_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.research_projects AS project
    WHERE project.id = target_project_id
      AND (
        (
          project.status <> 'archived'
          AND (
            project.visibility = 'public'
            OR (project.visibility = 'members' AND auth.uid() IS NOT NULL)
          )
        )
        OR project.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.research_project_members AS member
          WHERE member.project_id = project.id
            AND member.user_id = auth.uid()
            AND member.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM public.research_collaboration_requests AS request
          WHERE request.project_id = project.id
            AND request.status = 'pending'
            AND auth.uid() IN (request.sender_id, request.recipient_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_contribute_research_project(target_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.research_projects AS project
    WHERE project.id = target_project_id
      AND project.status NOT IN ('completed', 'archived')
      AND (
        project.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.research_project_members AS member
          WHERE member.project_id = project.id
            AND member.user_id = auth.uid()
            AND member.status = 'active'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_research_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_research_project(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.can_contribute_research_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_contribute_research_project(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_research_project_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link_allowed boolean;
  v_validate_link boolean := false;
BEGIN
  NEW.updated_at := statement_timestamp();

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('proposal', 'recruiting') THEN
      RAISE EXCEPTION 'Research projects must begin as a proposal or in recruiting.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.linked_post_id IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'A new research proposal cannot already have a completed output.'
        USING ERRCODE = '23514';
    END IF;
    NEW.created_at := statement_timestamp();
    NEW.status_changed_at := statement_timestamp();
  ELSE
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Research project ownership cannot be transferred.' USING ERRCODE = '42501';
    END IF;
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'Research project URLs are permanent.' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.status_changed_at := OLD.status_changed_at;
    NEW.completed_at := OLD.completed_at;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'proposal' AND NEW.status IN ('recruiting', 'active', 'archived'))
      OR (OLD.status = 'recruiting' AND NEW.status IN ('active', 'archived'))
      OR (OLD.status = 'active' AND NEW.status IN ('analysis', 'writing', 'completed', 'archived'))
      OR (OLD.status = 'analysis' AND NEW.status IN ('active', 'writing', 'completed', 'archived'))
      OR (OLD.status = 'writing' AND NEW.status IN ('active', 'analysis', 'completed', 'archived'))
      OR (OLD.status = 'completed' AND NEW.status IN ('writing', 'archived'))
    ) THEN
      RAISE EXCEPTION 'Invalid research project lifecycle transition.' USING ERRCODE = '23514';
    END IF;

    NEW.status_changed_at := statement_timestamp();
    IF NEW.status = 'completed' THEN
      NEW.completed_at := coalesce(OLD.completed_at, statement_timestamp());
    ELSIF OLD.status = 'completed' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;

  IF NEW.linked_post_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      v_validate_link := true;
    ELSIF NEW.linked_post_id IS DISTINCT FROM OLD.linked_post_id THEN
      v_validate_link := true;
    END IF;
  END IF;

  IF v_validate_link THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.posts AS post
      WHERE post.id = NEW.linked_post_id
        AND post.type = 'research'
        AND post.status = 'published'
        AND (post.citation_id IS NOT NULL OR post.published_version_id IS NOT NULL)
        AND (
          post.author_id = NEW.owner_id
          OR EXISTS (
            SELECT 1 FROM public.post_authors AS author
            WHERE author.post_id = post.id
              AND author.user_id = NEW.owner_id
              AND author.accepted_at IS NOT NULL
          )
        )
    ) INTO v_link_allowed;

    IF NOT v_link_allowed THEN
      RAISE EXCEPTION 'Linked output must be formally reviewed, published research owned or coauthored by the project lead.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_research_project_write() FROM PUBLIC;

CREATE TRIGGER research_projects_guard_write
BEFORE INSERT OR UPDATE ON public.research_projects
FOR EACH ROW EXECUTE FUNCTION public.guard_research_project_write();

CREATE OR REPLACE FUNCTION public.initialize_research_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.research_project_members (
    project_id, user_id, role, status, invited_by
  ) VALUES (
    NEW.id, NEW.owner_id, 'lead', 'active', NEW.owner_id
  )
  ON CONFLICT (project_id, user_id) DO NOTHING;

  INSERT INTO public.research_project_events (
    project_id, actor_id, event_type, to_status
  ) VALUES (
    NEW.id, NEW.owner_id, 'project_created', NEW.status
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_research_project() FROM PUBLIC;

CREATE TRIGGER research_projects_initialize
AFTER INSERT ON public.research_projects
FOR EACH ROW EXECUTE FUNCTION public.initialize_research_project();

CREATE OR REPLACE FUNCTION public.record_research_project_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.research_project_events (
      project_id, actor_id, event_type, from_status, to_status
    ) VALUES (
      NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status
    );
  END IF;

  IF NEW.linked_post_id IS DISTINCT FROM OLD.linked_post_id
    AND NEW.linked_post_id IS NOT NULL THEN
    INSERT INTO public.research_project_events (
      project_id, actor_id, event_type, metadata
    ) VALUES (
      NEW.id,
      auth.uid(),
      'output_linked',
      jsonb_build_object('postId', NEW.linked_post_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_research_project_change() FROM PUBLIC;

CREATE TRIGGER research_projects_record_change
AFTER UPDATE ON public.research_projects
FOR EACH ROW EXECUTE FUNCTION public.record_research_project_change();

CREATE OR REPLACE FUNCTION public.guard_researcher_profile_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := statement_timestamp();
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Research profiles cannot be transferred.' USING ERRCODE = '42501';
    END IF;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_researcher_profile_write() FROM PUBLIC;
CREATE TRIGGER researcher_profiles_guard_write
BEFORE INSERT OR UPDATE ON public.researcher_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_researcher_profile_write();

CREATE OR REPLACE FUNCTION public.guard_research_project_update_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := statement_timestamp();
  ELSE
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'Research update authorship and project are permanent.'
        USING ERRCODE = '23514';
    END IF;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_research_project_update_write() FROM PUBLIC;
CREATE TRIGGER research_project_updates_guard_write
BEFORE INSERT OR UPDATE ON public.research_project_updates
FOR EACH ROW EXECUTE FUNCTION public.guard_research_project_update_write();

CREATE OR REPLACE FUNCTION public.guard_research_project_asset_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := statement_timestamp();
  ELSE
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
      OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
      OR NEW.external_url IS DISTINCT FROM OLD.external_url THEN
      RAISE EXCEPTION 'Research asset provenance is permanent.' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_research_project_asset_write() FROM PUBLIC;
CREATE TRIGGER research_project_assets_guard_write
BEFORE INSERT OR UPDATE ON public.research_project_assets
FOR EACH ROW EXECUTE FUNCTION public.guard_research_project_asset_write();

ALTER TABLE public.researcher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_collaboration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_project_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_project_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_expansion_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Researcher profiles are public"
  ON public.researcher_profiles FOR SELECT USING (true);
CREATE POLICY "Users create own researcher profile"
  ON public.researcher_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own researcher profile"
  ON public.researcher_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Accessible research projects are readable"
  ON public.research_projects FOR SELECT
  USING (public.can_access_research_project(id));
CREATE POLICY "Users create own research projects"
  ON public.research_projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update research projects"
  ON public.research_projects FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete early research projects"
  ON public.research_projects FOR DELETE TO authenticated
  USING (auth.uid() = owner_id AND status IN ('proposal', 'recruiting'));

CREATE POLICY "Accessible project members are readable"
  ON public.research_project_members FOR SELECT
  USING (public.can_access_research_project(project_id));

CREATE POLICY "Request participants can read collaboration requests"
  ON public.research_collaboration_requests FOR SELECT TO authenticated
  USING (
    auth.uid() IN (sender_id, recipient_id)
    OR EXISTS (
      SELECT 1 FROM public.research_projects AS project
      WHERE project.id = project_id AND project.owner_id = auth.uid()
    )
  );

CREATE POLICY "Accessible research updates are readable"
  ON public.research_project_updates FOR SELECT
  USING (
    (visibility = 'public' AND public.can_access_research_project(project_id))
    OR public.can_contribute_research_project(project_id)
  );
CREATE POLICY "Active project members create updates"
  ON public.research_project_updates FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND public.can_contribute_research_project(project_id)
  );
CREATE POLICY "Authors update own research updates"
  ON public.research_project_updates FOR UPDATE TO authenticated
  USING (auth.uid() = author_id AND public.can_contribute_research_project(project_id))
  WITH CHECK (auth.uid() = author_id AND public.can_contribute_research_project(project_id));

CREATE POLICY "Accessible research events are readable"
  ON public.research_project_events FOR SELECT
  USING (public.can_access_research_project(project_id));

CREATE POLICY "Accessible research assets are readable"
  ON public.research_project_assets FOR SELECT
  USING (
    (visibility = 'public' AND public.can_access_research_project(project_id))
    OR public.can_contribute_research_project(project_id)
  );
CREATE POLICY "Active project members create assets"
  ON public.research_project_assets FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by
    AND public.can_contribute_research_project(project_id)
  );
CREATE POLICY "Uploaders manage own research assets"
  ON public.research_project_assets FOR UPDATE TO authenticated
  USING (auth.uid() = uploaded_by AND public.can_contribute_research_project(project_id))
  WITH CHECK (auth.uid() = uploaded_by AND public.can_contribute_research_project(project_id));
CREATE POLICY "Uploaders delete own research assets"
  ON public.research_project_assets FOR DELETE TO authenticated
  USING (auth.uid() = uploaded_by AND public.can_contribute_research_project(project_id));

-- Add Phase 4 collaboration events to the latest notification superset.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'like', 'comment', 'follow', 'debate_reply', 'debate_argument',
    'fellowship', 'badge', 'post_approved', 'post_rejected',
    'post_published', 'review_assigned', 'review_started', 'review_reminder',
    'revision_requested',
    'co_author_invite', 'co_author_accepted', 'co_author_declined',
    'response_post', 'opportunity_inquiry',
    'moderation_post_removed', 'moderation_comment_hidden', 'account_suspended',
    'debate_v2_round_change', 'debate_v2_final_vote',
    'debate_v2_direct_response', 'debate_v2_evidence_requested',
    'debate_invitation', 'debate_invitation_response',
    'debate_phase_advanced', 'debate_cancelled',
    'author_published', 'author_subscribed', 'topic_published',
    'research_collaboration_request', 'research_collaboration_accepted',
    'research_collaboration_declined'
  ]));

CREATE OR REPLACE FUNCTION public.create_research_collaboration_request(
  p_project_id uuid,
  p_direction text,
  p_requested_role text,
  p_message text,
  p_offered_skills text[] DEFAULT '{}',
  p_recipient_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_project public.research_projects%ROWTYPE;
  v_recipient_id uuid;
  v_request_id uuid;
  v_actor_name text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_direction NOT IN ('join_request', 'invitation') THEN
    RAISE EXCEPTION 'Invalid collaboration request direction.' USING ERRCODE = '22023';
  END IF;
  IF p_requested_role NOT IN ('researcher', 'data_analyst', 'field_researcher', 'writer', 'advisor', 'contributor') THEN
    RAISE EXCEPTION 'Invalid project role.' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_message, ''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Collaboration message must be 10 to 1,000 characters.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(coalesce(p_offered_skills, '{}')) > 10 THEN
    RAISE EXCEPTION 'Add at most 10 offered skills.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_valid_research_text_array(coalesce(p_offered_skills, '{}'), 10) THEN
    RAISE EXCEPTION 'Collaboration skills must each be 1 to 80 characters.' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*)
    FROM public.research_collaboration_requests AS recent_request
    WHERE recent_request.sender_id = v_actor_id
      AND recent_request.created_at > statement_timestamp() - interval '1 hour'
  ) >= 10 THEN
    RAISE EXCEPTION 'Too many collaboration requests. Try again later.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_project
  FROM public.research_projects
  WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Research project not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_direction = 'join_request' THEN
    IF v_actor_id = v_project.owner_id THEN
      RAISE EXCEPTION 'Project owners are already members.' USING ERRCODE = '22023';
    END IF;
    IF v_project.visibility NOT IN ('public', 'members')
      OR v_project.status NOT IN ('recruiting', 'active') THEN
      RAISE EXCEPTION 'This project is not accepting collaboration requests.' USING ERRCODE = '42501';
    END IF;
    v_recipient_id := v_project.owner_id;
  ELSE
    IF v_actor_id <> v_project.owner_id THEN
      RAISE EXCEPTION 'Only the project owner can invite collaborators.' USING ERRCODE = '42501';
    END IF;
    IF v_project.status IN ('completed', 'archived') THEN
      RAISE EXCEPTION 'This project is no longer recruiting collaborators.' USING ERRCODE = '23514';
    END IF;
    v_recipient_id := p_recipient_id;
  END IF;

  IF v_recipient_id IS NULL OR v_recipient_id = v_actor_id
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_recipient_id) THEN
    RAISE EXCEPTION 'Choose a valid collaborator.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.research_project_members
    WHERE project_id = p_project_id
      AND user_id = CASE WHEN p_direction = 'join_request' THEN v_actor_id ELSE v_recipient_id END
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'This person is already an active project member.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.research_collaboration_requests (
    project_id, sender_id, recipient_id, direction, requested_role,
    message, offered_skills
  ) VALUES (
    p_project_id, v_actor_id, v_recipient_id, p_direction, p_requested_role,
    btrim(p_message), coalesce(p_offered_skills, '{}')
  )
  RETURNING id INTO v_request_id;

  SELECT coalesce(nullif(btrim(full_name), ''), username)
  INTO v_actor_name
  FROM public.profiles WHERE id = v_actor_id;

  INSERT INTO public.notifications (user_id, type, actor_id, message, link)
  VALUES (
    v_recipient_id,
    'research_collaboration_request',
    v_actor_id,
    coalesce(v_actor_name, 'A researcher') ||
      CASE WHEN p_direction = 'join_request'
        THEN ' asked to join "' || v_project.title || '".'
        ELSE ' invited you to collaborate on "' || v_project.title || '".'
      END,
    '/research/projects/' || v_project.slug || '?view=requests'
  );

  INSERT INTO public.activation_events (
    user_id, event_name, metadata, source, route
  ) VALUES (
    v_actor_id,
    'research_collaboration_request_created',
    jsonb_build_object('projectId', p_project_id, 'direction', p_direction, 'role', p_requested_role),
    'database_rpc',
    '/research/projects/' || v_project.slug
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_research_collaboration_request(uuid, text, text, text, text[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_research_collaboration_request(uuid, text, text, text, text[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_research_collaboration_request(
  p_request_id uuid,
  p_accept boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_request public.research_collaboration_requests%ROWTYPE;
  v_project public.research_projects%ROWTYPE;
  v_member_id uuid;
  v_next_status text := CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END;
  v_actor_name text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.research_collaboration_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.recipient_id <> v_actor_id THEN
    RAISE EXCEPTION 'Collaboration request not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This collaboration request has already been resolved.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_project
  FROM public.research_projects
  WHERE id = v_request.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Research project not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.research_collaboration_requests
  SET status = v_next_status, responded_at = statement_timestamp()
  WHERE id = v_request.id;

  IF p_accept THEN
    v_member_id := CASE
      WHEN v_request.direction = 'join_request' THEN v_request.sender_id
      ELSE v_request.recipient_id
    END;

    INSERT INTO public.research_project_members (
      project_id, user_id, role, status, invited_by, joined_at, removed_at
    ) VALUES (
      v_request.project_id,
      v_member_id,
      v_request.requested_role,
      'active',
      CASE WHEN v_request.direction = 'invitation'
        THEN v_request.sender_id
        ELSE v_request.recipient_id
      END,
      statement_timestamp(),
      NULL
    )
    ON CONFLICT (project_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'active',
        invited_by = EXCLUDED.invited_by,
        joined_at = statement_timestamp(),
        removed_at = NULL;

    INSERT INTO public.research_project_events (
      project_id, actor_id, event_type, metadata
    ) VALUES (
      v_request.project_id,
      v_actor_id,
      'member_joined',
      jsonb_build_object('memberId', v_member_id, 'role', v_request.requested_role, 'requestId', v_request.id)
    );
  END IF;

  SELECT coalesce(nullif(btrim(full_name), ''), username)
  INTO v_actor_name
  FROM public.profiles WHERE id = v_actor_id;

  INSERT INTO public.notifications (user_id, type, actor_id, message, link)
  VALUES (
    v_request.sender_id,
    CASE WHEN p_accept
      THEN 'research_collaboration_accepted'
      ELSE 'research_collaboration_declined'
    END,
    v_actor_id,
    coalesce(v_actor_name, 'A researcher') ||
      CASE WHEN p_accept THEN ' accepted' ELSE ' declined' END ||
      ' the collaboration request for "' || v_project.title || '".',
    '/research/projects/' || v_project.slug
  );

  INSERT INTO public.activation_events (
    user_id, event_name, metadata, source, route
  ) VALUES (
    v_actor_id,
    CASE WHEN p_accept
      THEN 'research_collaboration_request_accepted'
      ELSE 'research_collaboration_request_declined'
    END,
    jsonb_build_object('projectId', v_project.id, 'requestId', v_request.id),
    'database_rpc',
    '/research/projects/' || v_project.slug
  );

  RETURN v_project.slug;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_research_collaboration_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_research_collaboration_request(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_research_expansion_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH config AS (
    SELECT * FROM public.research_expansion_targets WHERE scope = 'global'
  ),
  bounds AS (
    SELECT
      statement_timestamp() - make_interval(days => config.window_days) AS window_start,
      statement_timestamp() >= config.measurement_started_at + make_interval(days => config.window_days)
        AS window_complete,
      config.*
    FROM config
  ),
  project_facts AS (
    SELECT
      count(*) FILTER (WHERE project.created_at >= bounds.window_start) AS proposals_created,
      count(*) FILTER (WHERE project.status IN ('active', 'analysis', 'writing')) AS active_projects,
      count(*) FILTER (
        WHERE project.completed_at >= bounds.window_start
      ) AS completed_projects,
      count(*) FILTER (WHERE project.linked_post_id IS NOT NULL) AS linked_outputs,
      coalesce(sum(post.read_count) FILTER (WHERE project.linked_post_id IS NOT NULL), 0) AS linked_output_reads,
      coalesce(sum(post.view_count) FILTER (WHERE project.linked_post_id IS NOT NULL), 0) AS linked_output_views
    FROM bounds
    LEFT JOIN public.research_projects AS project ON true
    LEFT JOIN public.posts AS post ON post.id = project.linked_post_id
  ),
  collaboration_facts AS (
    SELECT
      count(*) FILTER (WHERE request.created_at >= bounds.window_start) AS requests_created,
      count(*) FILTER (
        WHERE request.status = 'accepted'
          AND request.responded_at >= bounds.window_start
      ) AS accepted_collaborations
    FROM bounds
    LEFT JOIN public.research_collaboration_requests AS request ON true
  ),
  member_facts AS (
    SELECT count(DISTINCT member.user_id) FILTER (
      WHERE member.status = 'active'
        AND member.role <> 'lead'
        AND member.joined_at >= bounds.window_start
    ) AS active_collaborators
    FROM bounds
    LEFT JOIN public.research_project_members AS member ON true
  ),
  update_facts AS (
    SELECT count(*) FILTER (
      WHERE project_update.visibility = 'public'
        AND project_update.created_at >= bounds.window_start
    ) AS public_updates
    FROM bounds
    LEFT JOIN public.research_project_updates AS project_update ON true
  ),
  asset_facts AS (
    SELECT count(*) FILTER (
      WHERE asset.asset_type IN ('image', 'audio', 'video', 'dataset', 'document')
        AND asset.upload_status = 'ready'
        AND asset.created_at >= bounds.window_start
    ) AS multimedia_assets
    FROM bounds
    LEFT JOIN public.research_project_assets AS asset ON true
  ),
  view_facts AS (
    SELECT count(*) FILTER (
      WHERE event.event_name = 'research_project_viewed'
        AND event.created_at >= bounds.window_start
    ) AS project_views
    FROM bounds
    LEFT JOIN public.activation_events AS event ON true
  )
  SELECT jsonb_build_object(
    'windowDays', bounds.window_days,
    'windowStart', bounds.window_start,
    'windowComplete', bounds.window_complete,
    'measurementStartedAt', bounds.measurement_started_at,
    'proposalsCreated', project_facts.proposals_created,
    'activeProjects', project_facts.active_projects,
    'completedProjects', project_facts.completed_projects,
    'linkedOutputs', project_facts.linked_outputs,
    'linkedOutputReads', project_facts.linked_output_reads,
    'linkedOutputViews', project_facts.linked_output_views,
    'requestsCreated', collaboration_facts.requests_created,
    'acceptedCollaborations', collaboration_facts.accepted_collaborations,
    'activeCollaborators', member_facts.active_collaborators,
    'publicUpdates', update_facts.public_updates,
    'multimediaAssets', asset_facts.multimedia_assets,
    'projectViews', view_facts.project_views,
    'targets', jsonb_build_object(
      'proposalsCreated', bounds.proposals_created_target,
      'activeProjects', bounds.active_projects_target,
      'acceptedCollaborations', bounds.accepted_collaborations_target,
      'completedProjects', bounds.completed_projects_target,
      'publicUpdates', bounds.public_updates_target,
      'multimediaAssets', bounds.multimedia_assets_target
    )
  )
  FROM bounds, project_facts, collaboration_facts, member_facts, update_facts,
    asset_facts, view_facts;
$$;

REVOKE ALL ON FUNCTION public.get_research_expansion_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_research_expansion_metrics() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_research_expansion_metrics() TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'research-project-assets',
  'research-project-assets',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
    'video/mp4', 'video/webm',
    'application/pdf', 'text/csv', 'application/json',
    'application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

GRANT SELECT ON public.researcher_profiles, public.research_projects,
  public.research_project_members, public.research_project_updates,
  public.research_project_events, public.research_project_assets
  TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.researcher_profiles,
  public.research_projects, public.research_project_updates,
  public.research_project_assets
  TO authenticated;
GRANT SELECT ON public.research_collaboration_requests TO authenticated;
GRANT ALL ON public.researcher_profiles, public.research_projects,
  public.research_project_members, public.research_collaboration_requests,
  public.research_project_updates, public.research_project_events,
  public.research_project_assets, public.research_expansion_targets
  TO service_role;

COMMIT;
