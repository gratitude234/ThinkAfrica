"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Question {
  id: string;
  content: string;
  upvotes: number;
  answered: boolean;
  created_at: string;
  profiles: { username: string; full_name: string } | null;
}

interface Props {
  webinarId: string;
  initialQuestions: Question[];
  userId: string | null;
  isHost: boolean;
  webinarStatus: string;
}

export default function WebinarQA({
  webinarId,
  initialQuestions,
  userId,
  isHost,
  webinarStatus,
}: Props) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`webinar-qa:${webinarId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "webinar_questions",
          filter: `webinar_id=eq.${webinarId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("webinar_questions")
            .select("id, content, upvotes, answered, created_at, profiles!webinar_questions_author_id_fkey (username, full_name)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            const q = {
              ...data,
              profiles: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles,
            } as Question;
            setQuestions((prev) =>
              [q, ...prev].sort((a, b) => b.upvotes - a.upvotes)
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "webinar_questions",
          filter: `webinar_id=eq.${webinarId}`,
        },
        (payload) => {
          setQuestions((prev) =>
            prev
              .map((q) =>
                q.id === payload.new.id
                  ? { ...q, upvotes: payload.new.upvotes, answered: payload.new.answered }
                  : q
              )
              .sort((a, b) => b.upvotes - a.upvotes)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [webinarId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !content.trim()) return;
    setSubmitting(true);
    const supabase = createClient();
    await supabase.from("webinar_questions").insert([
      { webinar_id: webinarId, author_id: userId, content: content.trim() },
    ]);
    setContent("");
    setSubmitting(false);
  };

  const handleUpvote = async (questionId: string) => {
    const supabase = createClient();
    await supabase.rpc("toggle_question_upvote", { p_question_id: questionId });
  };

  const handleMarkAnswered = async (questionId: string, answered: boolean) => {
    const supabase = createClient();
    await supabase
      .from("webinar_questions")
      .update({ answered: !answered })
      .eq("id", questionId);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Live Q&amp;A</h2>

      {/* Submit question */}
      {userId && webinarStatus !== "ended" ? (
        <form onSubmit={handleSubmit} className="mb-6">
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Ask a question..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none mb-2"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="px-4 py-1.5 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting..." : "Submit Question"}
            </button>
          </div>
        </form>
      ) : webinarStatus === "ended" ? null : (
        <p className="text-sm text-gray-400 mb-6">
          Sign in to ask a question.
        </p>
      )}

      {/* Questions list */}
      {questions.length === 0 ? (
        <p className="text-sm text-gray-400">
          No questions yet. Be the first to ask!
        </p>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div
              key={q.id}
              className={`bg-white rounded-xl border p-4 ${
                q.answered ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-gray-800 flex-1">{q.content}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {q.answered && (
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Answered
                    </span>
                  )}
                  {isHost && (
                    <button
                      onClick={() => handleMarkAnswered(q.id, q.answered)}
                      className="text-xs text-gray-400 hover:text-emerald-600 transition-colors"
                    >
                      {q.answered ? "Unmark" : "Mark answered"}
                    </button>
                  )}
                  <button
                    onClick={() => handleUpvote(q.id)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                    {q.upvotes}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {q.profiles?.full_name ?? q.profiles?.username ?? "Anonymous"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
