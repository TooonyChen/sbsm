"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { clearAuthCookies, getAuthCookies, setAuthCookies } from "@/lib/auth-client";
import { normalizeBackendHost } from "@/lib/constants";

type AlertState =
  | { type: "success"; title: string; message: string }
  | { type: "error"; title: string; message: string }
  | null;

export default function SettingsPage() {
  const router = useRouter();
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

  useEffect(() => {
    const { host: storedHost, username: storedUsername, password: storedPassword } = getAuthCookies();
    setHost(storedHost);
    setUsername(storedUsername);
    setCurrentPassword(storedPassword);
  }, []);

  const effectivePassword = useMemo(() => password || currentPassword, [password, currentPassword]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAlert(null);

    const normalizedHost = normalizeBackendHost(host);
    if (!normalizedHost || !username || !effectivePassword) {
      setAlert({
        type: "error",
        title: "Missing credentials",
        message: "Backend URL, username, and password are required.",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(new URL("/verify", normalizedHost).toString(), {
        method: "GET",
        headers: {
          authorization: `Basic ${btoa(`${username}:${effectivePassword}`)}`,
          accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(response.status === 401 ? "Invalid credentials" : "Verification failed");
      }

      setAuthCookies(normalizedHost, username, effectivePassword);
      setCurrentPassword(effectivePassword);
      setPassword("");
      setAlert({
        type: "success",
        title: "Settings saved",
        message: "Credentials updated successfully.",
      });
    } catch (error) {
      console.error("Settings error", error);
      setAlert({
        type: "error",
        title: "Update failed",
        message:
          error instanceof Error ? error.message : "Unable to reach the worker. Check your connection.",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearAuthCookies();
    router.push("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-16 items-center gap-2 border-b bg-background px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-5" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <main className="flex-1 space-y-6 p-4">
        <Card>
          <CardHeader className="gap-3">
            <CardTitle>Connection Settings</CardTitle>
            <CardDescription>
              Update the Cloudflare Worker endpoint or administrator credentials used for API requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="worker-url">Worker URL</Label>
                <Input
                  id="worker-url"
                  placeholder="https://your-worker.workers.dev"
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-username">Username</Label>
                <Input
                  id="admin-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  placeholder={currentPassword ? "Leave blank to keep current password" : ""}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="outline" onClick={handleLogout}>
                  Log out
                </Button>
              </div>
            </form>
            {alert && (
              <div className="mt-6">
                <Alert variant={alert.type === "error" ? "destructive" : "default"}>
                  <AlertTitle>{alert.title}</AlertTitle>
                  <AlertDescription>{alert.message}</AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between text-sm text-muted-foreground">
            <span>Credentials are stored locally in browser cookies.</span>
            <Button variant="link" className="px-0" onClick={() => router.push("/dashboard")}>
              Return to dashboard
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
