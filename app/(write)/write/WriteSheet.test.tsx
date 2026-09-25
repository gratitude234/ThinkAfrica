import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import WriteSheet from "./WriteSheet";

function Harness({ busy = false, onClose }: { busy?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sources
      </button>
      <WriteSheet
        open={open}
        title="Sources"
        busy={busy}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <input aria-label="Source title" />
      </WriteSheet>
    </>
  );
}

describe("WriteSheet", () => {
  it("renders nothing until it is opened", () => {
    render(<Harness />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a labelled dialog that closes on Escape and hands focus back", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open sources" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Sources" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("stays open on Escape while it is busy", () => {
    const onClose = vi.fn();
    render(<Harness busy onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sources" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Sources" })).toBeInTheDocument();
  });

  it("leaves out its close button when the footer has a Cancel", () => {
    render(
      <WriteSheet open title="Publish settings" onClose={vi.fn()} closeButton={false} footer={<button type="button">Cancel</button>}>
        <p>Body</p>
      </WriteSheet>
    );

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
