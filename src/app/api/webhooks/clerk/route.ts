import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema/users";

type ClerkWebhookEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    image_url: string;
    email_addresses: {
      email_address: string;
    }[];
  };
};

export async function POST(request: Request) {
  try {
    const secret = process.env.CLERK_WEBHOOK_SECRET;

    if (!secret) {
      console.error("CLERK_WEBHOOK_SECRET is missing");

      return NextResponse.json(
        {
          error: "Webhook secret is not configured",
        },
        {
          status: 500,
        },
      );
    }

    const body = await request.text();

    const headerPayload = await headers();

    const svixId = headerPayload.get("svix-id");
    const svixTimestamp = headerPayload.get("svix-timestamp");
    const svixSignature = headerPayload.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json(
        {
          error: "Missing webhook headers",
        },
        {
          status: 400,
        },
      );
    }

    const webhook = new Webhook(secret);

    let event: ClerkWebhookEvent;

    try {
      event = webhook.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkWebhookEvent;
    } catch (error) {
      console.error("CLERK_WEBHOOK_VERIFICATION_FAILED", error);

      return NextResponse.json(
        {
          error: "Invalid webhook signature",
        },
        {
          status: 400,
        },
      );
    }

    const { data } = event;

    switch (event.type) {
      case "user.created": {
        const email = data.email_addresses[0]?.email_address;

        if (!email) {
          return NextResponse.json(
            {
              error: "User email not found",
            },
            {
              status: 400,
            },
          );
        }

        const name =
          [data.first_name, data.last_name]
            .filter(Boolean)
            .join(" ") || "Orbit User";

        await db
          .insert(users)
          .values({
            clerkId: data.id,
            name,
            email,
            image: data.image_url,
          })
          .onConflictDoNothing({
            target: users.clerkId,
          });

        break;
      }

      case "user.updated": {
        const name =
          [data.first_name, data.last_name]
            .filter(Boolean)
            .join(" ") || "Orbit User";

        const email = data.email_addresses[0]?.email_address;

        await db
          .update(users)
          .set({
            name,
            email,
            image: data.image_url,
            updatedAt: new Date(),
          })
          .where(eq(users.clerkId, data.id));

        break;
      }

      case "user.deleted": {
        await db
          .delete(users)
          .where(eq(users.clerkId, data.id));

        break;
      }

      default:
        break;
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("CLERK_WEBHOOK_ERROR", error);

    return NextResponse.json(
      {
        error: "Webhook processing failed",
      },
      {
        status: 500,
      },
    );
  }
}