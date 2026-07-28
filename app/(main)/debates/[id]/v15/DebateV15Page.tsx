import { notFound } from "next/navigation";
import { loadDebateV15Room } from "./loadRoomData";
import DebateV15Room from "./DebateV15Room";

export default async function DebateV15Page({
  debateId,
}: {
  debateId: string;
}) {
  const room = await loadDebateV15Room(debateId);
  if (!room) notFound();

  return <DebateV15Room room={room} />;
}
