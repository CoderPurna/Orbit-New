import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { meetings } from "@/db/schema/meetings";

import { createMeetingSchema } from "@/lib/validations/meeting";
import { generateMeetingCode } from "@/lib/meetings/generate-code";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const body = await request.json();

    const result = createMeetingSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: result.error.flatten(),
        },
        {
          status: 400,
        },
      );
    }

    const { title } = result.data;

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.clerkId, userId),
    });

    if (!user) {
      return NextResponse.json(
        {
          error: "User profile not found",
        },
        {
          status: 404,
        },
      );
    }

    const joinCode = generateMeetingCode();

    const [meeting] = await db
      .insert(meetings)
      .values({
        hostId: user.id,
        title,
        joinCode,
      })
      .returning();

    return NextResponse.json(
      {
        meeting,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("CREATE_MEETING_ERROR", error);

    return NextResponse.json(
      {
        error: "Failed to create meeting",
      },
      {
        status: 500,
      },
    );
  }
}