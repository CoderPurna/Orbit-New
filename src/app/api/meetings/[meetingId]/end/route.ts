
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, ne, isNull } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { meetings } from "@/db/schema/meetings";
import { participants } from "@/db/schema/participants";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    // 1. Authenticate the caller.
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 2. Validate the meeting ID.
    const { meetingId } = await params;

    if (!uuidPattern.test(meetingId)) {
      return NextResponse.json(
        { error: "Invalid meeting ID" },
        { status: 400 },
      );
    }

    // 3. Resolve the caller to an Orbit user.
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

    // 4. End the meeting only if this user owns it
    //    and it has not already ended.
    const [meeting] = await db
      .update(meetings)
      .set({
        status: "ended",
        endedAt: new Date(),
      })
      .where(
        and(
          eq(meetings.id, meetingId),
          eq(meetings.hostId, user.id),
          ne(meetings.status, "ended"),
        ),
      )
      .returning({
        id: meetings.id,
        title: meetings.title,
        status: meetings.status,
        endedAt: meetings.endedAt,
      });

    if (!meeting) {
      // Determine whether the meeting exists and whether
      // the caller is its host.
      const existingMeeting = await db.query.meetings.findFirst({
        where: eq(meetings.id, meetingId),
        columns: {
          id: true,
          hostId: true,
          status: true,
        },
      });

      if (!existingMeeting) {
        return NextResponse.json(
          { error: "Meeting not found" },
          { status: 404 },
        );
      }

      if (existingMeeting.hostId !== user.id) {
        return NextResponse.json(
          { error: "Only the host can end this meeting" },
          { status: 403 },
        );
      }

      return NextResponse.json(
        { error: "Meeting has already ended" },
        { status: 409 },
      );
    }

    // 5. Mark any active participants as having left.
    await db
      .update(participants)
      .set({
        leftAt: meeting.endedAt ?? new Date(),
      })
      .where(
        and(
          eq(participants.meetingId, meeting.id),
          isNull(participants.leftAt),
        ),
      );

    return NextResponse.json({
      message: "Meeting ended successfully",
      meeting,
    });
  } catch (error) {
    console.error("END_MEETING_ERROR", error);

    return NextResponse.json(
      { error: "Failed to end meeting" },
      { status: 500 },
    );
  }
}
