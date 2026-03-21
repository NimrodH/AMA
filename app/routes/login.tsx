import * as React from "react";
import { redirect } from "react-router";
import type { Route } from "./+types/login";
import { Button } from "~/components/ui/button/button";
import { Input } from "~/components/ui/input/input";
import { Label } from "~/components/ui/label/label";
import { signIn, buildAuthCookie, getSession } from "~/lib/auth.server";
import styles from "./login.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "כניסה - מערכת ניהול לימודים" }];
}

// Redirect already-authenticated users to home
export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (session) throw redirect("/");
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = (formData.get("email") as string)?.trim();
  const password = (formData.get("password") as string)?.trim();

  if (!email || !password) {
    return { error: "נא למלא אימייל וסיסמה" };
  }

  try {
    const { accessToken } = await signIn(email, password);
    return redirect("/", {
      headers: { "Set-Cookie": buildAuthCookie(accessToken) },
    });
  } catch (err) {
    return { error: "אימייל או סיסמה שגויים. אנא נסה שנית." };
  }
}

export default function Login({ actionData }: Route.ComponentProps) {
  const error = actionData?.error;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoArea}>
          <h1 className={styles.appName}>מערכת הלימוד שלי</h1>
          <p className={styles.tagline}>כניסה לחשבון</p>
        </div>

        <form method="post" className={styles.form}>
          <div className={styles.field}>
            <Label htmlFor="email">אימייל</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="your@email.com"
              autoComplete="email"
              autoFocus
              dir="ltr"
            />
          </div>

          <div className={styles.field}>
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              dir="ltr"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" className={styles.submitBtn}>
            כניסה
          </Button>
        </form>
      </div>
    </div>
  );
}
