
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { meetings } from "@/db/schema/meetings";

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
    // 1. Authenticate the user.
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 2. Read and validate the meeting ID.
    const { meetingId } = await params;

    if (!uuidPattern.test(meetingId)) {
      return NextResponse.json(
        { error: "Invalid meeting ID" },
        { status: 400 },
      );
    }

    // 3. Retrieve only the fields the client needs.
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.id, meetingId),
      columns: {
        id: true,
        title: true,
        joinCode: true,
        status: true,
        hostId: true,
        createdAt: true,
        startedAt: true,
        endedAt: true,
      },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    // 4. Return the meeting details.
    return NextResponse.json({ meeting });
  } catch (error) {
    console.error("GET_MEETING_ERROR", error);

    return NextResponse.json(
      { error: "Failed to retrieve meeting" },
      { status: 500 },
    );
  }
}
