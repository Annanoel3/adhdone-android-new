import { FocusRoomParticipant } from "@/entities/FocusRoomParticipant";

// Puts the signed-in person in a focus room: adds their place in it, or
// refreshes the one they already have. Their own place is the only one they
// can make or change. Leave currentTask out to keep what an existing place
// already says they're working on.
export async function joinRoom(room, user, currentTask) {
  const existing = await FocusRoomParticipant.filter({
    room_id: room.id,
    user_email: user.email
  });
  const fresh = { last_seen: new Date().toISOString(), emoji_status: "💪" };

  if (existing.length > 0) {
    await FocusRoomParticipant.update(
      existing[0].id,
      currentTask === undefined ? fresh : { current_task: currentTask, ...fresh }
    );
  } else {
    await FocusRoomParticipant.create({
      room_id: room.id,
      user_email: user.email,
      display_name: user.display_name || user.full_name,
      profile_picture_url: user.profile_picture_url,
      current_task: currentTask || "",
      ...fresh
    });
  }
}