import * as React from "react";
import { createClient } from "@supabase/supabase-js";
import { useNavigate } from "react-router";
import type { Route } from "./+types/login";
import { Button } from "~/components/ui/button/button";
import { Input } from "~/components/ui/input/input";
import { Label } from "~/components/ui/label/label";
import { saveToken, saveRefreshToken } from "~/lib/auth.client";
import styles from "./login.module.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "כניסה - מערכת ניהול לימודים" }];
}

// No server loader needed — the page is fully public
export function loader() {
  return {};
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error: authError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (authError || !data.session) {
        setError("אימייל או סיסמה שגויים. אנא נסה שנית.");
        return;
      }

      // Save tokens to localStorage + cookie so server loaders can authenticate
      saveToken(data.session.access_token);
      saveRefreshToken(data.session.refresh_token);

      // Use client-side navigation so the clientLoader on "/" picks up the token
      // from localStorage. Avoids full-page reload which breaks in iframe previews.
      navigate("/");
    } catch {
      setError("שגיאה בהתחברות. אנא נסה שנית.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoArea}>
          <h1 className={styles.appName}>מערכת הלימוד שלי</h1>
          <p className={styles.tagline}>כניסה לחשבון</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" className={styles.submitBtn} disabled={isLoading}>
            {isLoading ? "מתחבר..." : "כניסה"}
          </Button>
        </form>
      </div>
    </div>
  );
}
