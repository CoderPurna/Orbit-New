
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { meetings } from "@/db/schema/meetings";
import { participants } from "@/db/schema/participants";
import { messages } from "@/db/schema/messages";
import z from "zod";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: RouteContext,
) {
  try {
    // 1. Verify authentication.
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

    // 3. Resolve the authenticated Clerk user to an Orbit user.
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

    // 4. Check that the meeting exists.
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

    // 5. Allow only the host or an active participant.
    const isHost = meeting.hostId === user.id;

    const membership = await db.query.participants.findFirst({
      where: and(
        eq(participants.meetingId, meeting.id),
        eq(participants.userId, user.id),
        isNull(participants.leftAt),
      ),
      columns: { id: true },
    });

    if (!isHost && !membership) {
      return NextResponse.json(
        { error: "You are not a member of this meeting" },
        { status: 403 },
      );
    }

    // 6. Validate pagination parameters.
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit") ?? "50";
    const limit = Number(rawLimit);

    if (
      !/^\d+$/.test(rawLimit) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return NextResponse.json(
        { error: "limit must be an integer between 1 and 100" },
        { status: 400 },
      );
    }

    // 7. Fetch the most recent messages.
    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
        userId: users.id,
        senderName: users.name,
        senderImage: users.image,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(eq(messages.meetingId, meeting.id))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // Return messages in chronological order for the UI.
    rows.reverse();

    return NextResponse.json({
      messages: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error("GET_MEETING_MESSAGES_ERROR", error);

    return NextResponse.json(
      { error: "Failed to retrieve messages" },
      { status: 500 },
    );
  }
}


const createMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(2000, "Message must be 2000 characters or less"),
});

export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  try {
    // 1. Authenticate the sender with Clerk.
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

    // 3. Parse and validate the message body.
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = createMessageSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid message",
          details: result.error.flatten(),
        },
        { status: 400 },
      );
    }

    // 4. Resolve the Clerk identity to an Orbit user.
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: {
        id: true,
        name: true,
        image: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 409 },
      );
    }

    // 5. Verify that the meeting exists and is not ended.
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

    // 6. Verify active membership, or host ownership.
    const isHost = meeting.hostId === user.id;

    const membership = await db.query.participants.findFirst({
      where: and(
        eq(participants.meetingId, meeting.id),
        eq(participants.userId, user.id),
        isNull(participants.leftAt),
      ),
      columns: { id: true },
    });

    if (!isHost && !membership) {
      return NextResponse.json(
        { error: "You are not an active meeting participant" },
        { status: 403 },
      );
    }

    // 7. Save the message in PostgreSQL.
    const [message] = await db
      .insert(messages)
      .values({
        meetingId: meeting.id,
        userId: user.id,
        content: result.data.content,
      })
      .returning({
        id: messages.id,
        meetingId: messages.meetingId,
        content: messages.content,
        createdAt: messages.createdAt,
      });

    // 8. Return the saved message with sender information.
    return NextResponse.json(
      {
        message: {
          ...message,
          sender: {
            id: user.id,
            name: user.name,
            image: user.image,
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("CREATE_MEETING_MESSAGE_ERROR", error);

    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
