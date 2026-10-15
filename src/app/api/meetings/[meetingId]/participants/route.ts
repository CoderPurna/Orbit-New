
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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    // 1. Authenticate the requester.
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

    // 3. Find the corresponding Orbit user.
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

    // 4. Confirm that the requester is the host
    //    or an active participant.
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.id, meetingId),
      columns: {
        id: true,
        hostId: true,
      },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    const isHost = meeting.hostId === user.id;

    const activeMembership = await db.query.participants.findFirst({
      where: and(
        eq(participants.meetingId, meeting.id),
        eq(participants.userId, user.id),
        isNull(participants.leftAt),
      ),
      columns: { id: true },
    });

    if (!isHost && !activeMembership) {
      return NextResponse.json(
        { error: "You are not a member of this meeting" },
        { status: 403 },
      );
    }

    // 5. Retrieve active participants and their public profile fields.
    const rows = await db
      .select({
        id: participants.id,
        role: participants.role,
        joinedAt: participants.joinedAt,
        userId: users.id,
        name: users.name,
        image: users.image,
      })
      .from(participants)
      .innerJoin(users, eq(participants.userId, users.id))
      .where(
        and(
          eq(participants.meetingId, meeting.id),
          isNull(participants.leftAt),
        ),
      );

    return NextResponse.json({
      participants: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error("GET_MEETING_PARTICIPANTS_ERROR", error);

    return NextResponse.json(
      { error: "Failed to retrieve participants" },
      { status: 500 },
    );
  }
}
