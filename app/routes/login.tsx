import * as React from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "~/components/ui/button/button";
import { Input } from "~/components/ui/input/input";
import { Label } from "~/components/ui/label/label";
import { saveToken, getToken } from "~/lib/auth";
import styles from "./login.module.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function meta() {
  return [{ title: "כניסה - מערכת ניהול לימודים" }];
}

// If already logged in (token in localStorage), redirect immediately
export function clientLoader() {
  if (typeof window !== "undefined") {
    const token = getToken();
    if (token) {
      window.location.href = "/";
      return null;
    }
  }
  return null;
}

export default function Login() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("נא למלא אימייל וסיסמה");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (authError || !data.session) {
        setError("אימייל או סיסמה שגויים. אנא נסה שנית.");
        return;
      }

      // Save token to localStorage
      saveToken(data.session.access_token);

      // Full page navigation so server loaders pick up the token via cookie
      window.location.href = "/";
    } catch {
      setError("אירעה שגיאה. אנא נסה שנית.");
    } finally {
      setLoading(false);
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

          <Button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "מתחבר..." : "כניסה"}
          </Button>
        </form>
      </div>
    </div>
  );
}
