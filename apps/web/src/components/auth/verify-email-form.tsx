"use client";

import { verifyEmailSchema, type CodeRequestResponse } from "@mentorloop/shared";
import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Field } from "@/components/auth/field";
import { StatusPageActions } from "@/components/common/status-page-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/lib/api-client";
import { confirmEmailVerification, requestEmailVerification } from "@/lib/auth-api";
import { getPostLoginRoute } from "@/lib/routes";

function startCooldown(seconds: number, setRemaining: (n: number) => void): () => void {
  setRemaining(seconds);
  const started = Date.now();
  const id = window.setInterval(() => {
    const left = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
    setRemaining(left);
    if (left <= 0) window.clearInterval(id);
  }, 250);
  return () => window.clearInterval(id);
}

export function VerifyEmailForm() {
  const { status, user } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const requestedOnMount = useRef(false);
  const clearCooldown = useRef<(() => void) | null>(null);

  // Already verified → continue to the right post-login destination.
  useEffect(() => {
    if (status === "authenticated" && user?.emailVerified) {
      router.replace(getPostLoginRoute(user));
    }
  }, [status, user, router]);

  useEffect(() => {
    return () => clearCooldown.current?.();
  }, []);

  function beginCooldown(seconds: number) {
    clearCooldown.current?.();
    clearCooldown.current = startCooldown(seconds, setCooldown);
  }

  function applyRequestResult(result: CodeRequestResponse, isResend: boolean) {
    beginCooldown(result.resendAfterSeconds);
    if (result.devCode) {
      setDevCode(result.devCode);
      setCode(result.devCode);
      setInfo(
        isResend
          ? "New local-dev code (real email delivery is not wired yet):"
          : "Local-dev code (real email delivery is not wired yet):",
      );
    } else {
      setDevCode(null);
      setInfo(
        isResend
          ? "A new code has been sent. Check your inbox."
          : "We sent a 6-digit code to your email. It expires in 10 minutes.",
      );
    }
  }

  async function sendCode(isResend: boolean) {
    if (requesting || cooldown > 0) return;
    setRequesting(true);
    setFormError(null);
    try {
      applyRequestResult(await requestEmailVerification(), isResend);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        const match = /(\d+)\s*seconds?/i.exec(err.message);
        if (match) beginCooldown(Number(match[1]));
        setInfo(err.message);
      } else {
        setFormError(
          err instanceof ApiClientError
            ? err.message
            : "Could not send a verification code. Please try again.",
        );
      }
    } finally {
      setRequesting(false);
    }
  }

  // Auto-request once when the page loads for an unverified user.
  useEffect(() => {
    if (status !== "authenticated" || !user || user.emailVerified) return;
    if (requestedOnMount.current) return;
    requestedOnMount.current = true;

    setRequesting(true);
    void requestEmailVerification()
      .then((result) => {
        applyRequestResult(result, false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.status === 409) {
          const match = /(\d+)\s*seconds?/i.exec(err.message);
          if (match) beginCooldown(Number(match[1]));
          setInfo(err.message);
          return;
        }
        setFormError(
          err instanceof ApiClientError
            ? err.message
            : "Could not send a verification code. Please try again.",
        );
      })
      .finally(() => setRequesting(false));
  }, [status, user]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !user) return;
    setFormError(null);

    const parsed = verifyEmailSchema.safeParse({ code });
    if (!parsed.success) {
      setCodeError(parsed.error.flatten().fieldErrors.code?.[0]);
      return;
    }
    setCodeError(undefined);
    setSubmitting(true);
    try {
      const verified = await confirmEmailVerification(parsed.data.code);
      router.replace(getPostLoginRoute(verified));
    } catch (err) {
      setFormError(
        err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  if (!user || user.emailVerified) {
    return (
      <div className="flex justify-center py-6 text-muted-foreground" role="status">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Code sent to <span className="font-medium text-foreground">{user.email}</span>
      </p>

      {info ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {info}
        </p>
      ) : null}

      {devCode ? (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-3 font-mono text-2xl tracking-[0.35em] text-foreground">
          {devCode}
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-4 text-left">
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <Field id="code" label="Verification code" error={codeError}>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-invalid={Boolean(codeError)}
            aria-describedby={codeError ? "code-error" : undefined}
            className="text-center font-mono text-lg tracking-[0.3em]"
            disabled={submitting}
          />
        </Field>

        <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              Verifying…
            </>
          ) : (
            "Verify email"
          )}
        </Button>
      </form>

      <div className="flex flex-col items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={requesting || cooldown > 0}
          onClick={() => void sendCode(true)}
        >
          {requesting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : cooldown > 0 ? (
            `Resend code in ${cooldown}s`
          ) : (
            <>
              <Mail className="mr-2 size-4" aria-hidden="true" />
              Resend code
            </>
          )}
        </Button>
        <StatusPageActions />
      </div>
    </div>
  );
}
