"use client";

import Link from "next/link";
import { useState } from "react";

interface Props {
  text: string;
  href: string;
  hasTitle?: boolean;
}

function needsExpansion(text: string) {
  return text.length > 180 || text.split(/\r?\n/).length > 4;
}

export default function ExpandablePostBody({
  text,
  href,
  hasTitle = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const expandable = needsExpansion(text);

  return (
    <div data-post-body-state={expanded ? "expanded" : "collapsed"}>
      <Link
        href={href}
        className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        <p
          className={`${
            expandable && !expanded ? "line-clamp-4" : ""
          } ${
            hasTitle
              ? "text-[15.5px] text-gray-600"
              : "text-[16px] text-gray-800 sm:text-[16.5px]"
          } whitespace-pre-line leading-[1.62]`}
        >
          {text}
        </p>
      </Link>

      {expandable ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="mt-1.5 inline-flex min-h-8 items-center rounded-md px-1 text-[12.5px] font-bold text-emerald-800 hover:text-emerald-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {expanded ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
}
