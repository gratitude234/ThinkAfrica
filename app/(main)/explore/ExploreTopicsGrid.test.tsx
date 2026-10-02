import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ExploreTopicsGrid from "./ExploreTopicsGrid";
const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/(main)/settings/profileActions", () => ({ setProfileInterests: save }));
vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));
const topics = [{tag:"Technology", count:4, followed:false}, {tag:"Culture", count:1, followed:false}];
it("disables conflicting saves and reports a failed follow with rollback", async () => {
  let resolve!: (value: unknown) => void;
  save.mockImplementation(() => new Promise(r => {resolve = r;}));
  render(<ExploreTopicsGrid topics={topics} userId="viewer" initialInterests={[]} />);
  fireEvent.click(screen.getByRole("button", {name:"Follow Technology"}));
  expect(screen.getByRole("button", {name:"Follow Culture"})).toBeDisabled();
  await act(async () => resolve({ok:false}));
  expect(screen.getByRole("alert")).toHaveTextContent("Could not update");
  expect(screen.getByRole("button", {name:"Follow Technology"})).toHaveAttribute("aria-pressed", "false");
});
it("persists follows and sends the next unfollow without dropping other interests", async () => {
  save.mockResolvedValueOnce({ok:true, data:{interests:["Culture", "Technology"]}}).mockResolvedValueOnce({ok:true, data:{interests:["Culture"]}});
  render(<ExploreTopicsGrid topics={topics} userId="viewer" initialInterests={["Culture"]} />);
  fireEvent.click(screen.getByRole("button", {name:"Follow Technology"}));
  await screen.findByRole("button", {name:"Unfollow Technology"});
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", {name:"Unfollow Technology"}));
  await screen.findByRole("button", {name:"Follow Technology"});
  expect(save).toHaveBeenLastCalledWith({interests:["Culture"]});
});
it("gives guests browse links without authenticated follow controls", () => {
  render(<ExploreTopicsGrid topics={topics} userId={null} initialInterests={[]} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("link", {name:/Technology/})).toHaveAttribute("href", "/topics/Technology");
});
