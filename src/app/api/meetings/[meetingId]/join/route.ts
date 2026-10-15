
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
    // 1. Authenticate the user.
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 2. Validate the route parameter.
    const { meetingId } = await params;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        meetingId,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid meeting ID" },
        { status: 400 },
      );
    }

    // 3. Find the Orbit user linked to Clerk.
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

    // 4. Check whether the meeting exists and is joinable.
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.id, meetingId),
      columns: {
        id: true,
        hostId: true,
        status: true,
      },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    if (meeting.status === "ended") {
      return NextResponse.json(
        { error: "This meeting has ended" },
        { status: 410 },
      );
    }

    // 5. Reuse an existing active participant record.
    const existingParticipant =
      await db.query.participants.findFirst({
        where: and(
          eq(participants.meetingId, meeting.id),
          eq(participants.userId, user.id),
          isNull(participants.leftAt),
        ),
      });

    if (existingParticipant) {
      return NextResponse.json({
        participant: existingParticipant,
        alreadyJoined: true,
      });
    }

    // 6. Assign the host role only to the actual meeting host.
    const role =
      meeting.hostId === user.id ? "host" : "participant";

    // 7. Register the participant.
    const [participant] = await db
      .insert(participants)
      .values({
        meetingId: meeting.id,
        userId: user.id,
        role,
      })
      .returning();

    return NextResponse.json(
      {
        participant,
        alreadyJoined: false,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("JOIN_MEETING_ERROR", error);

    return NextResponse.json(
      { error: "Failed to join meeting" },
      { status: 500 },
    );
  }
}
