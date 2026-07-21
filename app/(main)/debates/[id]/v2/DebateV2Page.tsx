import { notFound } from "next/navigation";
import { loadDebateV2Room } from "./loadRoomData";
import DebateV2Room from "./DebateV2Room";

export default async function DebateV2Page({ debateId }: { debateId: string }) {
  const room = await loadDebateV2Room(debateId);

  if (!room) notFound();

  return <DebateV2Room debateId={debateId} initialRoom={room} />;
}
