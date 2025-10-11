"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { apiFetch } from "@/lib/api-client";

type DashboardStats = {
  links: number;
  groups: number;
  baseConfigs: number;
  configs: number;
};

const initialStats: DashboardStats = {
  links: 0,
  groups: 0,
  baseConfigs: 0,
  configs: 0,
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [links, groups, baseConfigs, configs] = await Promise.all([
          apiFetch<{ id: string }[]>("/api/links"),
          apiFetch<{ id: string }[]>("/api/groups"),
          apiFetch<{ id: string }[]>("/api/base-configs"),
          apiFetch<{ id: string }[]>("/api/configs"),
        ]);
        if (!cancelled) {
          setStats({
            links: links.length,
            groups: groups.length,
            baseConfigs: baseConfigs.length,
            configs: configs.length,
          });
        }
      } catch (err) {
        console.error("Failed to load dashboard stats", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load dashboard statistics.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-16 items-center gap-2 border-b bg-background px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-5" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <main className="flex-1 space-y-6 p-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load data</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="VPN Nodes"
            description="Managed subscription links synced from the worker."
            value={stats.links}
            loading={loading}
            href="/nodes"
          />
          <StatCard
            title="VPN Groups"
            description="Collections of nodes for selector-based routing."
            value={stats.groups}
            loading={loading}
            href="/groups"
          />
          <StatCard
            title="Base Configs"
            description="Sing-box templates ready for outbound injection."
            value={stats.baseConfigs}
            loading={loading}
            href="/base"
          />
          <StatCard
            title="Rendered Configs"
            description="Shareable sing-box configs built from base templates."
            value={stats.configs}
            loading={loading}
            href="/config"
          />
        </section>
        <section className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Quick start</CardTitle>
              <CardDescription>Follow these steps to prepare a shareable configuration.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
                <li>Add VPN nodes under the <strong>VPN Nodes</strong> section.</li>
                <li>Group related nodes for selector routing under <strong>VPN Groups</strong>.</li>
                <li>Create a base template in <strong>Base Configs</strong> or import an existing JSON file.</li>
                <li>Compose a rendered profile in <strong>Sing-box Configs</strong> and share it with a token.</li>
              </ol>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Helpful links</CardTitle>
              <CardDescription>Documentation and shortcuts for common workflows.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <LinkItem href="/nodes">Add a new VPN node</LinkItem>
              <LinkItem href="/groups">Create a VPN group</LinkItem>
              <LinkItem href="/base">Import a base config</LinkItem>
              <LinkItem href="/config">Generate shareable configs</LinkItem>
              <LinkItem
                href="https://sing-box.sagernet.org/configuration/outbound/vless/"
                external
              >
                sing-box documentation
              </LinkItem>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

interface StatCardProps {
  title: string;
  description: string;
  value: number;
  loading: boolean;
  href: string;
}

function StatCard({ title, description, value, loading, href }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="text-4xl font-semibold tracking-tight">
          {loading ? <span className="text-muted-foreground">…</span> : value}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={href}>Manage</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function LinkItem({ href, children, external }: { href: string; children: ReactNode; external?: boolean }) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground transition hover:text-foreground hover:underline"
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className="text-muted-foreground transition hover:text-foreground hover:underline">
      {children}
    </Link>
  );
}
