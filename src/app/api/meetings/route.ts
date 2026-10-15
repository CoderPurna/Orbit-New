import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { meetings } from "@/db/schema/meetings";
import { createMeetingSchema } from "@/lib/validations/meeting";
import { generateMeetingCode } from "@/lib/meetings/generate-code";

export async function POST(request: Request) {
  try {
    // 1. Verify the current Clerk user.
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 2. Parse and validate the request body.
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = createMeetingSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: result.error.flatten(),
        },
        { status: 400 },
      );
    }

    // 3. Find the corresponding Orbit user.
    const user = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User profile not found. Please try again shortly." },
        { status: 409 },
      );
    }

    // 4. Generate a join code and insert the meeting.
    const joinCode = generateMeetingCode();

    const [meeting] = await db
      .insert(meetings)
      .values({
        hostId: user.id,
        title: result.data.title,
        joinCode,
      })
      .returning({
        id: meetings.id,
        title: meetings.title,
        joinCode: meetings.joinCode,
        status: meetings.status,
        createdAt: meetings.createdAt,
      });

    // 5. Return the newly created meeting.
    return NextResponse.json(
      { meeting },
      { status: 201 },
    );
  } catch (error) {
    console.error("CREATE_MEETING_ERROR", error);

    return NextResponse.json(
      { error: "Failed to create meeting" },
      { status: 500 },
    );
  }
}