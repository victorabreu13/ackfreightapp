"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { devLoginEnabled, signIn, signOut } from "@/lib/auth";

function rethrowAuth(error: unknown): never {
  if (isRedirectError(error)) throw error;
  redirect("/login?error=credentials");
}

export async function signInGoogle() {
  await signIn("google", { redirectTo: "/guias" });
}

export async function signInDev(formData: FormData) {
  if (!devLoginEnabled()) redirect("/login?error=dev");
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      devLogin: "1",
      redirectTo: "/guias",
    });
  } catch (error) {
    rethrowAuth(error);
  }
}

export async function signInCustomer(formData: FormData) {
  try {
    await signIn("customer", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/portal",
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirect("/login?customer=1&error=credentials");
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
