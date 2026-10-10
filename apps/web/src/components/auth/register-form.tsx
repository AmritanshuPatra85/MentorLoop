"use client";

import { registerSchema, type SignupRole } from "@mentorloop/shared";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/lib/api-client";
import { registerAccount } from "@/lib/auth-api";
import { getPostLoginRoute } from "@/lib/routes";

type FieldErrors = {
  fullName?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
  role?: string | undefined;
};

const ROLES: { value: SignupRole; title: string; description: string }[] = [
  {
    value: "founder",
    title: "I'm a founder",
    description: "I'm building a startup and want a mentor.",
  },
  {
    value: "mentor",
    title: "I'm a mentor",
    description: "I want to mentor student startups.",
  },
];

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SignupRole>("founder");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const parsed = registerSchema.safeParse({ fullName, email, password, role });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({
        fullName: flat.fullName?.[0],
        email: flat.email?.[0],
        password: flat.password?.[0],
        role: flat.role?.[0],
      });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const session = await registerAccount(parsed.data);
      router.replace(getPostLoginRoute(session.user));
    } catch (err) {
      setFormError(
        err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">I am joining as</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <label
              key={r.value}
              className="flex cursor-pointer gap-3 rounded-md border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={role === r.value}
                onChange={() => setRole(r.value)}
                className="mt-1 accent-[hsl(var(--primary))]"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{r.title}</span>
                <span className="block text-xs text-muted-foreground">{r.description}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.role ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.role}
          </p>
        ) : null}
      </fieldset>

      <Field id="full-name" label="Full name" error={errors.fullName}>
        <Input
          id="full-name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? "full-name-error" : undefined}
        />
      </Field>

      <Field
        id="email"
        label="Email"
        error={errors.email}
        hint={role === "founder" ? "Founder accounts require an @kiit.ac.in email." : undefined}
      >
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : role === "founder" ? "email-hint" : undefined}
        />
      </Field>

      <Field id="password" label="Password" error={errors.password} hint="At least 10 characters.">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : "password-hint"}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Create account
      </Button>
    </form>
  );
}
