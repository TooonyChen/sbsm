"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type GroupType = "manual" | "subscription";

type SubscriptionMetadata = {
  url: string;
  cached_node_count: number;
  last_fetched_at: number | null;
  last_error: string | null;
  exclude_keywords: string[];
};

type VpnGroup = {
  id: string;
  name: string;
  description: string | null;
  type: GroupType;
  created_at: number;
  updated_at: number;
  link_ids: string[];
  subscription: SubscriptionMetadata | null;
};

const DEFAULT_SUBSCRIPTION_KEYWORDS = ["流量", "套餐", "到期", "剩余"];

function parseKeywordInput(raw: string): string[] {
  const values = raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const unique = Array.from(new Set(values));
  return unique.length > 0 ? unique : [...DEFAULT_SUBSCRIPTION_KEYWORDS];
}

function normalizeGroup(group: VpnGroup): VpnGroup {
  const subscription = group.subscription
    ? {
        ...group.subscription,
        exclude_keywords:
          Array.isArray(group.subscription.exclude_keywords) && group.subscription.exclude_keywords.length > 0
            ? group.subscription.exclude_keywords
            : [...DEFAULT_SUBSCRIPTION_KEYWORDS],
      }
    : null;
  return {
    ...group,
    link_ids: group.link_ids ?? [],
    subscription,
  };
}

type VpnLink = {
  id: string;
  name: string | null;
  raw_link: string;
};

type AlertState =
  | { type: "success"; title: string; message: string }
  | { type: "error"; title: string; message: string }
  | null;

export default function GroupsPage() {
  const [groups, setGroups] = useState<VpnGroup[]>([]);
  const [links, setLinks] = useState<VpnLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<AlertState>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createType, setCreateType] = useState<GroupType>("manual");
  const [createSelection, setCreateSelection] = useState<Set<string>>(new Set());
  const [createSubscriptionUrl, setCreateSubscriptionUrl] = useState("");
  const [createSubscriptionFilters, setCreateSubscriptionFilters] = useState(
    DEFAULT_SUBSCRIPTION_KEYWORDS.join("\n")
  );
  const [submitting, setSubmitting] = useState(false);

  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editSelection, setEditSelection] = useState<Set<string>>(new Set());
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [subscriptionTarget, setSubscriptionTarget] = useState<VpnGroup | null>(null);
  const [subscriptionName, setSubscriptionName] = useState("");
  const [subscriptionDescription, setSubscriptionDescription] = useState("");
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [subscriptionFilters, setSubscriptionFilters] = useState(
    DEFAULT_SUBSCRIPTION_KEYWORDS.join("\n")
  );
  const [subscriptionSubmitting, setSubscriptionSubmitting] = useState(false);
  const [refreshingSubscriptionId, setRefreshingSubscriptionId] = useState<string | null>(null);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => b.created_at - a.created_at),
    [groups]
  );

  const linkLookup = useMemo(() => {
    const map = new Map<string, VpnLink>();
    for (const link of links) {
      map.set(link.id, link);
    }
    return map;
  }, [links]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setAlert(null);
      try {
        const [groupData, linkData] = await Promise.all([
          apiFetch<VpnGroup[]>("/api/groups"),
          apiFetch<VpnLink[]>("/api/links"),
        ]);
        if (!cancelled) {
          setGroups(groupData.map(normalizeGroup));
          setLinks(linkData);
        }
      } catch (error) {
        console.error("Failed to load groups", error);
        if (!cancelled) {
          setAlert({
            type: "error",
            title: "Failed to load groups",
            message: error instanceof Error ? error.message : "Unexpected error loading groups.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleCreateSelection(id: string) {
    setCreateSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleEditSelection(id: string) {
    setEditSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCreateGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = createName.trim();
    if (!trimmedName) {
      setAlert({
        type: "error",
        title: "Missing name",
        message: "Please provide a group name.",
      });
      return;
    }
    if (createType === "subscription" && !createSubscriptionUrl.trim()) {
      setAlert({
        type: "error",
        title: "Missing subscription link",
        message: "Provide a subscription URL for this group.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const payload =
        createType === "manual"
          ? {
              name: trimmedName,
              description: createDescription.trim() || undefined,
              type: "manual",
              linkIds: Array.from(createSelection),
            }
          : {
              name: trimmedName,
              description: createDescription.trim() || undefined,
              type: "subscription",
              subscriptionUrl: createSubscriptionUrl.trim(),
              excludeKeywords: parseKeywordInput(createSubscriptionFilters),
            };
      const created = await apiFetch<VpnGroup>("/api/groups", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setGroups((prev) => [normalizeGroup(created), ...prev]);
      setAlert({
        type: "success",
        title: "Group created",
        message: "VPN group saved successfully.",
      });
      setCreateName("");
      setCreateDescription("");
      setCreateType("manual");
      setCreateSelection(new Set());
      setCreateSubscriptionUrl("");
      setCreateSubscriptionFilters(DEFAULT_SUBSCRIPTION_KEYWORDS.join("\n"));
      setCreateDialogOpen(false);
    } catch (error) {
      console.error("Failed to create group", error);
      setAlert({
        type: "error",
        title: "Failed to create group",
        message: error instanceof Error ? error.message : "Unexpected error creating group.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateGroupLinks(event: React.FormEvent<HTMLFormElement>, group: VpnGroup) {
    event.preventDefault();
    if (group.type !== "manual") {
      setEditGroupId(null);
      setEditSelection(new Set());
      return;
    }
    const original = new Set(group.link_ids ?? []);
    const selected = new Set(editSelection);
    const toAdd: string[] = [];
    const toRemove: string[] = [];

    for (const id of selected) {
      if (!original.has(id)) {
        toAdd.push(id);
      }
    }
    for (const id of original) {
      if (!selected.has(id)) {
        toRemove.push(id);
      }
    }

    if (toAdd.length === 0 && toRemove.length === 0) {
      setEditGroupId(null);
      setEditSelection(new Set());
      setAlert({
        type: "success",
        title: "Group updated",
        message: "No membership changes were needed.",
      });
      return;
    }

    setEditSubmitting(true);
    try {
      if (toAdd.length > 0) {
        await apiFetch(`/api/groups/${group.id}/links`, {
          method: "POST",
          body: JSON.stringify({ linkIds: toAdd }),
        });
      }

      for (const linkId of toRemove) {
        await apiFetch(`/api/groups/${group.id}/links/${linkId}`, {
          method: "DELETE",
        });
      }

      const nextLinks = Array.from(selected);
      setGroups((prev) =>
        prev.map((item) => (item.id === group.id ? { ...item, link_ids: nextLinks } : item))
      );
      setAlert({
        type: "success",
        title: "Group updated",
        message: "VPN node membership saved successfully.",
      });
      setEditGroupId(null);
      setEditSelection(new Set());
    } catch (error) {
      console.error("Failed to update group nodes", error);
      setAlert({
        type: "error",
        title: "Failed to update group nodes",
        message: error instanceof Error ? error.message : "Unexpected error updating VPN nodes.",
      });
    } finally {
      setEditSubmitting(false);
    }
  }

  function openSubscriptionDialog(group: VpnGroup) {
    setSubscriptionTarget(group);
    setSubscriptionName(group.name);
    setSubscriptionDescription(group.description ?? "");
    setSubscriptionUrl(group.subscription?.url ?? "");
    setSubscriptionFilters(
      (group.subscription?.exclude_keywords ?? DEFAULT_SUBSCRIPTION_KEYWORDS).join("\n")
    );
  }

  async function handleUpdateSubscription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscriptionTarget) return;
    const trimmedName = subscriptionName.trim();
    const trimmedUrl = subscriptionUrl.trim();
    if (!trimmedName) {
      setAlert({
        type: "error",
        title: "Missing name",
        message: "Please provide a group name.",
      });
      return;
    }
    if (!trimmedUrl) {
      setAlert({
        type: "error",
        title: "Missing subscription link",
        message: "Subscription groups require a subscription URL.",
      });
      return;
    }
    setSubscriptionSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        description: subscriptionDescription.trim() || null,
        subscriptionUrl: trimmedUrl,
        excludeKeywords: parseKeywordInput(subscriptionFilters),
      };
      const updated = await apiFetch<VpnGroup>(`/api/groups/${subscriptionTarget.id}/subscription`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const normalized = normalizeGroup(updated);
      setGroups((prev) => prev.map((item) => (item.id === normalized.id ? normalized : item)));
      setAlert({
        type: "success",
        title: "Subscription updated",
        message: "The subscription group was updated successfully.",
      });
      setSubscriptionTarget(null);
      setSubscriptionFilters(DEFAULT_SUBSCRIPTION_KEYWORDS.join("\n"));
    } catch (error) {
      console.error("Failed to update subscription group", error);
      setAlert({
        type: "error",
        title: "Failed to update subscription",
        message: error instanceof Error ? error.message : "Unexpected error updating the subscription group.",
      });
    } finally {
      setSubscriptionSubmitting(false);
    }
  }

  async function handleRefreshSubscription(group: VpnGroup) {
    setRefreshingSubscriptionId(group.id);
    try {
      const updated = await apiFetch<VpnGroup>(`/api/groups/${group.id}/subscription/refresh`, {
        method: "POST",
      });
      const normalized = normalizeGroup(updated);
      setGroups((prev) => prev.map((item) => (item.id === normalized.id ? normalized : item)));
      if (subscriptionTarget && subscriptionTarget.id === normalized.id) {
        setSubscriptionTarget(normalized);
        setSubscriptionName(normalized.name);
        setSubscriptionDescription(normalized.description ?? "");
        setSubscriptionUrl(normalized.subscription?.url ?? "");
        setSubscriptionFilters(
          (normalized.subscription?.exclude_keywords ?? DEFAULT_SUBSCRIPTION_KEYWORDS).join("\n")
        );
      }
      setAlert({
        type: "success",
        title: "Subscription refreshed",
        message: "Fetched the latest nodes from the subscription link.",
      });
    } catch (error) {
      console.error("Failed to refresh subscription", error);
      setAlert({
        type: "error",
        title: "Failed to refresh",
        message: error instanceof Error ? error.message : "Unexpected error refreshing the subscription.",
      });
    } finally {
      setRefreshingSubscriptionId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-16 items-center gap-2 border-b bg-background px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-5" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>VPN Groups</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              setCreateDialogOpen(open);
              if (!open) {
                setCreateName("");
                setCreateDescription("");
                setCreateType("manual");
                setCreateSelection(new Set());
                setCreateSubscriptionUrl("");
                setCreateSubscriptionFilters(DEFAULT_SUBSCRIPTION_KEYWORDS.join("\n"));
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>Create group</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New VPN group</DialogTitle>
                <DialogDescription>
                  Organize VPN nodes to reuse selectors in sing-box configs or sync from subscription URLs.
                </DialogDescription>
              </DialogHeader>
              <form className="flex flex-col gap-4" onSubmit={handleCreateGroup}>
                <div className="grid gap-2">
                  <Label htmlFor="group-name">Group name</Label>
                  <Input
                    id="group-name"
                    placeholder="Streaming selectors"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="group-description">Description</Label>
                  <Textarea
                    id="group-description"
                    placeholder="Optional notes about this group."
                    value={createDescription}
                    onChange={(event) => setCreateDescription(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Group type</Label>
                  <Select
                    value={createType}
                    onValueChange={(value) => {
                      const nextType = value as GroupType;
                      setCreateType(nextType);
                      if (nextType === "manual") {
                        setCreateSubscriptionUrl("");
                        setCreateSubscriptionFilters(DEFAULT_SUBSCRIPTION_KEYWORDS.join("\n"));
                      } else {
                        setCreateSelection(new Set());
                        if (createSubscriptionFilters.trim().length === 0) {
                          setCreateSubscriptionFilters(DEFAULT_SUBSCRIPTION_KEYWORDS.join("\n"));
                        }
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select group type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual (pick nodes)</SelectItem>
                      <SelectItem value="subscription">Subscription (auto updates)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {createType === "manual" ? (
                  <div className="grid gap-3">
                    <Label>Attach VPN nodes</Label>
                    <div className="max-h-48 overflow-y-auto rounded-lg border p-3">
                      {links.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No VPN nodes available yet. Create nodes first.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {links.map((link) => {
                            const displayName = link.name?.length ? link.name : "Unnamed node";
                            return (
                              <label key={link.id} className="flex items-start gap-2 text-sm">
                                <Checkbox
                                  checked={createSelection.has(link.id)}
                                  onCheckedChange={() => toggleCreateSelection(link.id)}
                                />
                                <span className="flex flex-col">
                                  <span className="font-medium leading-none">{displayName}</span>
                                  <span className="text-xs text-muted-foreground">{link.raw_link}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label htmlFor="group-subscription-url">Subscription link</Label>
                    <Input
                      id="group-subscription-url"
                      placeholder="https://example.com/subscribe?token=..."
                      value={createSubscriptionUrl}
                      onChange={(event) => setCreateSubscriptionUrl(event.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      The latest nodes will be pulled from this link whenever configs use this group.
                    </p>
                    <div className="grid gap-2">
                      <Label htmlFor="group-subscription-filters">Exclude keywords</Label>
                      <Textarea
                        id="group-subscription-filters"
                        value={createSubscriptionFilters}
                        onChange={(event) => setCreateSubscriptionFilters(event.target.value)}
                        placeholder={DEFAULT_SUBSCRIPTION_KEYWORDS.join(",")}
                      />
                      <p className="text-xs text-muted-foreground">
                        Nodes whose names contain any of these keywords will be ignored. Separate values with commas or
                        new lines.
                      </p>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving…" : "Save group"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <main className="flex-1 space-y-6 p-4">
        {alert && (
          <Alert variant={alert.type === "error" ? "destructive" : "default"}>
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>{alert.message}</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Configured groups</CardTitle>
            {loading ? <span className="text-sm text-muted-foreground">Loading…</span> : null}
          </CardHeader>
          <CardContent>
            {sortedGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                {loading ? "Fetching groups from the worker…" : "No VPN groups yet. Create one to organize nodes."}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Nodes</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedGroups.map((group) => {
                      const manualNames =
                        group.type === "manual"
                          ? group.link_ids
                              .map((id) => {
                                const link = linkLookup.get(id);
                                if (!link) return null;
                                return link.name?.length ? link.name : "Unnamed node";
                              })
                              .filter((name): name is string => Boolean(name))
                          : [];
                      const totalManualLinks = group.type === "manual" ? group.link_ids.length : 0;
                      const visibleManualNames = manualNames.slice(0, 3);
                      const remainingManualCount = totalManualLinks - visibleManualNames.length;
                      const subscriptionInfo = group.subscription;

                      return (
                        <TableRow key={group.id}>
                          <TableCell className="font-medium">{group.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground capitalize">{group.type}</TableCell>
                          <TableCell className="max-w-[360px] text-sm text-muted-foreground">
                            {group.description ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                            {group.type === "manual" ? (
                              totalManualLinks === 0 ? (
                                "—"
                              ) : visibleManualNames.length > 0 ? (
                                <>
                                  <span>{visibleManualNames.join(", ")}</span>
                                  {remainingManualCount > 0 ? (
                                    <span className="ml-1 text-muted-foreground/70">+{remainingManualCount} more</span>
                                  ) : null}
                                </>
                              ) : (
                                `${totalManualLinks} node${totalManualLinks === 1 ? "" : "s"}`
                              )
                            ) : subscriptionInfo ? (
                              <div className="space-y-1">
                                <span>
                                  {subscriptionInfo.cached_node_count} node
                                  {subscriptionInfo.cached_node_count === 1 ? "" : "s"} cached
                                </span>
                                <span className="block text-muted-foreground/70">
                                  Last refresh:{" "}
                                  {subscriptionInfo.last_fetched_at
                                    ? new Date(subscriptionInfo.last_fetched_at * 1000).toLocaleString()
                                    : "Never"}
                                </span>
                                {subscriptionInfo.exclude_keywords.length > 0 ? (
                                  <span className="block text-muted-foreground/70">
                                    Filters: {subscriptionInfo.exclude_keywords.join(", ")}
                                  </span>
                                ) : null}
                                {subscriptionInfo.last_error ? (
                                  <span className="block text-[11px] text-destructive/80">
                                    Last error: {subscriptionInfo.last_error}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              "Subscription metadata unavailable"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(group.created_at * 1000).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {group.type === "manual" ? (
                              <Dialog
                                open={editGroupId === group.id}
                                onOpenChange={(open) => {
                                  if (open) {
                                    setEditGroupId(group.id);
                                    setEditSelection(new Set(group.link_ids ?? []));
                                  } else if (editGroupId === group.id) {
                                    setEditGroupId(null);
                                    setEditSelection(new Set());
                                    setEditSubmitting(false);
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    Edit nodes
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>Edit VPN nodes for {group.name}</DialogTitle>
                                    <DialogDescription>
                                      Toggle VPN nodes to attach or remove them from this group.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <form
                                    className="flex flex-col gap-4"
                                    onSubmit={(event) => handleUpdateGroupLinks(event, group)}
                                  >
                                    <div className="max-h-60 overflow-y-auto rounded-lg border p-3">
                                      {links.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                          No VPN nodes available. Add nodes first.
                                        </p>
                                      ) : (
                                        <div className="space-y-2">
                                          {links.map((link) => {
                                            const displayName = link.name?.length ? link.name : "Unnamed node";
                                            return (
                                              <label key={link.id} className="flex items-start gap-2 text-sm">
                                                <Checkbox
                                                  checked={editSelection.has(link.id)}
                                                  onCheckedChange={() => toggleEditSelection(link.id)}
                                                  disabled={editSubmitting}
                                                />
                                                <span className="flex flex-col">
                                                  <span className="font-medium leading-none">{displayName}</span>
                                                  <span className="text-xs font-mono text-muted-foreground break-all">
                                                    {link.raw_link}
                                                  </span>
                                                </span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                    <DialogFooter>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                          setEditGroupId(null);
                                          setEditSelection(new Set());
                                          setEditSubmitting(false);
                                        }}
                                        disabled={editSubmitting}
                                      >
                                        Cancel
                                      </Button>
                                      <Button type="submit" disabled={editSubmitting || links.length === 0}>
                                        {editSubmitting ? "Saving…" : "Save changes"}
                                      </Button>
                                    </DialogFooter>
                                  </form>
                                </DialogContent>
                              </Dialog>
                            ) : (
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => openSubscriptionDialog(group)}>
                                  Edit subscription
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRefreshSubscription(group)}
                                  disabled={refreshingSubscriptionId === group.id}
                                >
                                  {refreshingSubscriptionId === group.id ? "Refreshing…" : "Refresh"}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <p className="mt-4 text-sm text-muted-foreground">
                  Groups reference stored VPN nodes or subscription feeds when generating configs. Duplicate
                  attachments are ignored by the worker.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={Boolean(subscriptionTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setSubscriptionTarget(null);
            setSubscriptionSubmitting(false);
            setSubscriptionName("");
            setSubscriptionDescription("");
            setSubscriptionUrl("");
            setSubscriptionFilters(DEFAULT_SUBSCRIPTION_KEYWORDS.join("\n"));
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit subscription group</DialogTitle>
            <DialogDescription>Update the group details or replace the subscription URL.</DialogDescription>
          </DialogHeader>
          {subscriptionTarget && (
            <form className="flex flex-col gap-4" onSubmit={handleUpdateSubscription}>
              <div className="grid gap-2">
                <Label htmlFor="subscription-name">Group name</Label>
                <Input
                  id="subscription-name"
                  value={subscriptionName}
                  onChange={(event) => setSubscriptionName(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subscription-description">Description</Label>
                <Textarea
                  id="subscription-description"
                  value={subscriptionDescription}
                  onChange={(event) => setSubscriptionDescription(event.target.value)}
                  placeholder="Optional notes about this subscription group."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subscription-url">Subscription link</Label>
                <Input
                  id="subscription-url"
                  value={subscriptionUrl}
                  onChange={(event) => setSubscriptionUrl(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subscription-filters">Exclude keywords</Label>
                <Textarea
                  id="subscription-filters"
                  value={subscriptionFilters}
                  onChange={(event) => setSubscriptionFilters(event.target.value)}
                  placeholder={DEFAULT_SUBSCRIPTION_KEYWORDS.join(",")}
                />
                <p className="text-xs text-muted-foreground">
                  Nodes whose names contain any of these keywords will be ignored. Separate values with commas or new
                  lines.
                </p>
              </div>
              {subscriptionTarget.subscription ? (
                <div className="space-y-1 rounded-lg border p-3 text-xs text-muted-foreground">
                  <p>
                    Cached nodes: {subscriptionTarget.subscription.cached_node_count} node
                    {subscriptionTarget.subscription.cached_node_count === 1 ? "" : "s"}
                  </p>
                  <p>
                    Last refresh:{" "}
                    {subscriptionTarget.subscription.last_fetched_at
                      ? new Date(subscriptionTarget.subscription.last_fetched_at * 1000).toLocaleString()
                      : "Never"}
                  </p>
                  {subscriptionTarget.subscription.last_error ? (
                    <p className="text-destructive/80">
                      Last error: {subscriptionTarget.subscription.last_error}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSubscriptionTarget(null);
                    setSubscriptionSubmitting(false);
                  }}
                  disabled={subscriptionSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={subscriptionSubmitting}>
                  {subscriptionSubmitting ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
