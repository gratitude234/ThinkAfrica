"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, type ReactNode } from "react";

function BulletListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <path d="M6 4h8M6 8h8M6 12h8" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M6 4h8M6 8h8M6 12h8" />
      <path d="M1.6 2.6h1v3M1.4 10.4c.3-.6 1.5-.7 1.5.1 0 .7-1.5 1.2-1.5 2.1h1.7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 9.5a2.5 2.5 0 0 0 3.6.1l2-2a2.5 2.5 0 0 0-3.5-3.5l-.8.8" />
      <path d="M9.5 6.5a2.5 2.5 0 0 0-3.6-.1l-2 2a2.5 2.5 0 0 0 3.5 3.5l.8-.8" />
    </svg>
  );
}

function ToolbarButton({
  label,
  isActive = false,
  onClick,
  children,
}: {
  label: string;
  isActive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs transition-colors ${
        isActive
          ? "bg-green-tint text-emerald-brand"
          : "text-gray-500 hover:bg-canvas hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-gray-200" />;
}

/**
 * The composer.
 *
 * Seven controls, chosen so an executive writing a letter never has to think
 * about formatting. Anything the toolbar cannot produce is anything the email
 * template was never designed to carry.
 */
export default function BroadcastEditor({
  html,
  onChange,
}: {
  html: string;
  onChange: (html: string) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    content: html,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        codeBlock: false,
        code: false,
        strike: false,
        horizontalRule: false,
      }),
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      Placeholder.configure({
        placeholder: "Write to the community.",
      }),
    ],
    editorProps: {
      attributes: { class: "tiptap broadcast-composer-body" },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  if (!editor) {
    return <div className="min-h-[320px]" aria-hidden="true" />;
  }

  function applyLink() {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) return;

    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: url,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor.chain().focus().setLink({ href }).run();
    }

    setLinkUrl("");
    setLinkOpen(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 px-4 py-2 sm:px-6">
        <ToolbarButton
          label="Bold"
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="font-serif italic">I</span>
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Heading"
          isActive={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <span className="font-semibold">H2</span>
        </ToolbarButton>
        <ToolbarButton
          label="Subheading"
          isActive={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <span className="font-semibold">H3</span>
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Bulleted list"
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <BulletListIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <OrderedListIcon />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Link"
          isActive={editor.isActive("link") || linkOpen}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            setLinkOpen((previous) => !previous);
          }}
        >
          <LinkIcon />
        </ToolbarButton>
      </div>

      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-canvas px-4 py-2.5 sm:px-6">
          <input
            autoFocus
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") {
                setLinkOpen(false);
                setLinkUrl("");
              }
            }}
            placeholder="indegenius.africa/opportunities"
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink placeholder:text-gray-400 focus:border-emerald-brand/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={applyLink}
            className="rounded-md bg-emerald-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0E4B37]"
          >
            Add link
          </button>
          <button
            type="button"
            onClick={() => {
              setLinkOpen(false);
              setLinkUrl("");
            }}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-ink"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="px-4 py-6 sm:px-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
