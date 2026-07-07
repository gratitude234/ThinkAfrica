"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import {
  dismissReport,
  hideReportedComment,
  removeReportedPost,
  resolveReport,
  restoreRemovedPost,
  suspendUser,
  unhideComment,
  unsuspendUser,
} from "./actions";

type ActionKey =
  | "resolve"
  | "dismiss"
  | "remove_post"
  | "restore_post"
  | "hide_comment"
  | "unhide_comment"
  | "suspend"
  | "unsuspend";

interface Props {
  reportId: string;
  reportStatus: string;
  targetType: "post" | "comment" | "user";
  postId: string | null;
  postStatus: string | null;
  commentId: string | null;
  commentHidden: boolean;
  subjectUserId: string | null;
  subjectName: string;
  subjectIsAdmin: boolean;
  subjectSuspended: boolean;
  defaultSuspendReason: string;
}

const PRIMARY_BUTTON =
  "px-3 py-1.5 bg-emerald-brand text-white text-xs font-medium rounded-lg hover:bg-[#0E4B37] disabled:opacity-50 transition-colors";
const NEUTRAL_BUTTON =
  "px-3 py-1.5 bg-white text-gray-600 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors";
const DANGER_BUTTON =
  "px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors";

export default function ModerationActions({
  reportId,
  reportStatus,
  targetType,
  postId,
  postStatus,
  commentId,
  commentHidden,
  subjectUserId,
  subjectName,
  subjectIsAdmin,
  subjectSuspended,
  defaultSuspendReason,
}: Props) {
  const router = useRouter();
  const feedback = useAdminActionFeedback<ActionKey>();
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [suspendReason, setSuspendReason] = useState(defaultSuspendReason);

  const loading = feedback.pendingAction;
  const isPending = reportStatus === "pending";

  const run = async (
    action: ActionKey,
    pendingMessage: string,
    doneMessage: string,
    fn: () => Promise<{ error: string | null }>
  ) => {
    feedback.startAction(action, pendingMessage);
    const result = await fn();
    if (result.error) {
      feedback.failAction(result.error);
      return;
    }
    feedback.finishAction(doneMessage);
    setShowSuspendForm(false);
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {isPending ? (
          <>
            <button
              onClick={() =>
                run("resolve", "Resolving report...", "Report resolved.", () =>
                  resolveReport(reportId)
                )
              }
              disabled={loading !== null}
              className={PRIMARY_BUTTON}
            >
              {loading === "resolve" ? "Resolving..." : "Resolve"}
            </button>
            <button
              onClick={() =>
                run("dismiss", "Dismissing report...", "Report dismissed.", () =>
                  dismissReport(reportId)
                )
              }
              disabled={loading !== null}
              className={NEUTRAL_BUTTON}
            >
              {loading === "dismiss" ? "Dismissing..." : "Dismiss"}
            </button>
          </>
        ) : null}

        {targetType === "post" && postId && postStatus === "published" && isPending ? (
          <button
            onClick={() =>
              run("remove_post", "Removing post...", "Post removed.", () =>
                removeReportedPost(reportId)
              )
            }
            disabled={loading !== null}
            className={DANGER_BUTTON}
          >
            {loading === "remove_post" ? "Removing..." : "Remove post"}
          </button>
        ) : null}

        {targetType === "post" && postId && postStatus === "removed" ? (
          <button
            onClick={() =>
              run("restore_post", "Restoring post...", "Post restored.", () =>
                restoreRemovedPost(postId)
              )
            }
            disabled={loading !== null}
            className={NEUTRAL_BUTTON}
          >
            {loading === "restore_post" ? "Restoring..." : "Restore post"}
          </button>
        ) : null}

        {targetType === "comment" && commentId && !commentHidden && isPending ? (
          <button
            onClick={() =>
              run("hide_comment", "Hiding comment...", "Comment hidden.", () =>
                hideReportedComment(reportId)
              )
            }
            disabled={loading !== null}
            className={DANGER_BUTTON}
          >
            {loading === "hide_comment" ? "Hiding..." : "Hide comment"}
          </button>
        ) : null}

        {targetType === "comment" && commentId && commentHidden ? (
          <button
            onClick={() =>
              run("unhide_comment", "Unhiding comment...", "Comment unhidden.", () =>
                unhideComment(commentId)
              )
            }
            disabled={loading !== null}
            className={NEUTRAL_BUTTON}
          >
            {loading === "unhide_comment" ? "Unhiding..." : "Unhide comment"}
          </button>
        ) : null}

        {subjectUserId && !subjectIsAdmin && !subjectSuspended ? (
          <button
            onClick={() => setShowSuspendForm((current) => !current)}
            disabled={loading !== null}
            className={DANGER_BUTTON}
          >
            Suspend {subjectName}
          </button>
        ) : null}

        {subjectUserId && subjectSuspended ? (
          <button
            onClick={() =>
              run("unsuspend", "Lifting suspension...", "Suspension lifted.", () =>
                unsuspendUser(subjectUserId)
              )
            }
            disabled={loading !== null}
            className={NEUTRAL_BUTTON}
          >
            {loading === "unsuspend" ? "Lifting..." : "Unsuspend"}
          </button>
        ) : null}
      </div>

      {showSuspendForm && subjectUserId ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={suspendReason}
            onChange={(event) => setSuspendReason(event.target.value)}
            placeholder="Reason for suspension"
            className="w-64 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <button
            onClick={() =>
              run("suspend", "Suspending user...", "User suspended.", () =>
                suspendUser({
                  userId: subjectUserId,
                  reason: suspendReason,
                  reportId: isPending ? reportId : null,
                })
              )
            }
            disabled={loading !== null}
            className={DANGER_BUTTON}
          >
            {loading === "suspend" ? "Suspending..." : "Confirm suspension"}
          </button>
        </div>
      ) : null}

      <AdminActionStatus
        status={feedback.statusMessage}
        error={feedback.error}
        toastMessage={feedback.toastMessage}
        onToastDone={feedback.clearToast}
        className="mt-1 text-xs"
      />
    </div>
  );
}
