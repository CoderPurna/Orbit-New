
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { meetings } from "@/db/schema/meetings";

type RouteContext = {
  params: Promise<{ joinCode: string }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    // 1. Require an authenticated user.
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 2. Read and normalize the meeting code.
    const { joinCode: rawCode } = await params;
    const joinCode = rawCode.trim().toUpperCase();

    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(joinCode)) {
      return NextResponse.json(
        { error: "Invalid meeting code" },
        { status: 400 },
      );
    }

    // 3. Find the meeting.
    const meeting = await db.query.meetings.findFirst({
      where: eq(meetings.joinCode, joinCode),
      columns: {
        id: true,
        title: true,
        joinCode: true,
        status: true,
        hostId: true,
      },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    // 4. Do not allow joining an ended meeting.
    if (meeting.status === "ended") {
      return NextResponse.json(
        { error: "This meeting has ended" },
        { status: 410 },
      );
    }

    // 5. Return only the information needed for meeting discovery.
    return NextResponse.json({ meeting });
  } catch (error) {
    console.error("GET_MEETING_BY_CODE_ERROR", error);

    return NextResponse.json(
      { error: "Failed to retrieve meeting" },
      { status: 500 },
    );
  }
}
