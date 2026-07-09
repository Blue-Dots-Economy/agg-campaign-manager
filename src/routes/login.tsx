import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (login(email, password)) {
      navigate({ to: "/" });
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="h-11 w-11 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Briefcase className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-foreground">Operation Rozgar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to Mission Control</p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="email">Email</label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(false); }}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="password">Password</label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              required
            />
          </div>
          {error && (
            <p className="text-xs text-rose-600">Incorrect email or password.</p>
          )}
          <Button type="submit" className="w-full">Sign in</Button>
        </form>
      </div>
    </div>
  );
}
