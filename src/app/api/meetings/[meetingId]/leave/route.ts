
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { meetings } from "@/db/schema/meetings";
import { participants } from "@/db/schema/participants";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

export async function POST(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    // 1. Verify the user's Clerk session.
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 2. Read and validate the meeting ID.
    const { meetingId } = await params;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(meetingId)) {
      return NextResponse.json(
        { error: "Invalid meeting ID" },
        { status: 400 },
      );
    }

    // 3. Find the Orbit user associated with Clerk.
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 409 },
      );
    }

    // 4. Confirm the meeting exists.
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.id, meetingId),
      columns: { id: true },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    // 5. Mark the active participant record as left.
    const [participant] = await db
      .update(participants)
      .set({
        leftAt: new Date(),
      })
      .where(
        and(
          eq(participants.meetingId, meeting.id),
          eq(participants.userId, user.id),
          isNull(participants.leftAt),
        ),
      )
      .returning({
        id: participants.id,
        meetingId: participants.meetingId,
        userId: participants.userId,
        role: participants.role,
        joinedAt: participants.joinedAt,
        leftAt: participants.leftAt,
      });

    if (!participant) {
      return NextResponse.json(
        { error: "No active participation found" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      message: "You left the meeting successfully",
      participant,
    });
  } catch (error) {
    console.error("LEAVE_MEETING_ERROR", error);

    return NextResponse.json(
      { error: "Failed to leave meeting" },
      { status: 500 },
    );
  }
}
