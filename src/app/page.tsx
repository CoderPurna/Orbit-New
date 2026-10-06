import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center gap-4">
      <SignInButton mode="modal">
        <button>Sign In</button>
      </SignInButton>

      <SignUpButton mode="modal">
        <button>Sign Up</button>
      </SignUpButton>

      <UserButton />
    </main>
  );
}