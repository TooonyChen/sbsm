"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { getAuthCookies } from "@/lib/auth-client";

type BaseConfigSummary = {
  id: string;
  name: string;
};

type GroupSummary = {
  id: string;
  name: string;
  type?: "manual" | "subscription";
};

type ConfigSummary = {
  id: string;
  base_config_id: string;
  base_config_name: string | null;
  name: string;
  description: string | null;
  selector_tags: string[];
  share_enabled: boolean;
  share_token: string | null;
  group_ids: string[];
  created_at: number;
  updated_at: number;
};

type AlertState =
  | { type: "success"; title: string; message: string }
  | { type: "error"; title: string; message: string }
  | null;

export default function ConfigsPage() {
  const [configs, setConfigs] = useState<ConfigSummary[]>([]);
  const [baseConfigs, setBaseConfigs] = useState<BaseConfigSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<AlertState>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createBaseId, setCreateBaseId] = useState<string>("");
  const [createGroupSelection, setCreateGroupSelection] = useState<Set<string>>(new Set());
  const [createSelectors, setCreateSelectors] = useState("");
  const [createShareEnabled, setCreateShareEnabled] = useState(false);
  const [createShareToken, setCreateShareToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [shareTarget, setShareTarget] = useState<ConfigSummary | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareToken, setShareToken] = useState("");
  const [shareSubmitting, setShareSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<ConfigSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBaseId, setEditBaseId] = useState<string>("");
  const [editGroupSelection, setEditGroupSelection] = useState<Set<string>>(new Set());
  const [editSelectors, setEditSelectors] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ConfigSummary | null>(null);

  const sortedConfigs = useMemo(
    () => [...configs].sort((a, b) => b.updated_at - a.updated_at),
    [configs]
  );

  const { host } = getAuthCookies();

  const groupLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      map.set(group.id, group.name);
    }
    return map;
  }, [groups]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setAlert(null);
      try {
        const [configData, baseData, groupData] = await Promise.all([
          apiFetch<ConfigSummary[]>("/api/configs"),
          apiFetch<BaseConfigSummary[]>("/api/base-configs"),
          apiFetch<GroupSummary[]>("/api/groups"),
        ]);
        if (!cancelled) {
          setConfigs(configData.map((config) => ({ ...config, group_ids: config.group_ids ?? [] })));
          setBaseConfigs(baseData.map((item) => ({ id: item.id, name: item.name })));
          setGroups(
            groupData.map((item) => ({
              id: item.id,
              name: item.name,
              type: item.type ?? "manual",
            }))
          );
        }
      } catch (error) {
        console.error("Failed to load configs", error);
        if (!cancelled) {
          setAlert({
            type: "error",
            title: "Failed to load configs",
            message: error instanceof Error ? error.message : "Unexpected error loading configs.",
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

  function toggleCreateGroup(id: string) {
    setCreateGroupSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEditGroup(id: string) {
    setEditGroupSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function normalizeSelectors(raw: string): string[] {
    return raw
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createName.trim() || !createBaseId) {
      setAlert({
        type: "error",
        title: "Missing fields",
        message: "Provide a name and choose a base config.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        baseConfigId: createBaseId,
        groupIds: Array.from(createGroupSelection),
        selectorTags: normalizeSelectors(createSelectors),
        shareEnabled: createShareEnabled,
        shareToken: createShareToken.trim() || undefined,
      };
      const created = await apiFetch<ConfigSummary>("/api/configs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const baseName =
        created.base_config_name ??
        baseConfigs.find((base) => base.id === created.base_config_id)?.name ??
        null;
      const createdConfig: ConfigSummary = {
        ...created,
        base_config_name: baseName,
        group_ids: created.group_ids ?? Array.from(createGroupSelection),
      };
      setConfigs((prev) => [createdConfig, ...prev]);
      setAlert({
        type: "success",
        title: "Config created",
        message: "Rendered configuration saved successfully.",
      });
      resetCreateForm();
      setCreateDialogOpen(false);
    } catch (error) {
      console.error("Failed to create config", error);
      setAlert({
        type: "error",
        title: "Failed to create config",
        message: error instanceof Error ? error.message : "Unexpected error creating the config.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function resetCreateForm() {
    setCreateName("");
    setCreateDescription("");
    setCreateBaseId("");
    setCreateGroupSelection(new Set());
    setCreateSelectors("");
    setCreateShareEnabled(false);
    setCreateShareToken("");
  }

  function openShareDialog(config: ConfigSummary) {
    setShareTarget(config);
  }

  useEffect(() => {
    if (shareTarget) {
      setShareEnabled(shareTarget.share_enabled);
      setShareToken(shareTarget.share_token ?? "");
    } else {
      setShareEnabled(false);
      setShareToken("");
    }
  }, [shareTarget]);

  function openEditDialog(config: ConfigSummary) {
    setEditTarget(config);
    setEditName(config.name);
    setEditDescription(config.description ?? "");
    setEditBaseId(config.base_config_id);
    setEditGroupSelection(new Set(config.group_ids ?? []));
    setEditSelectors(config.selector_tags.join(", "));
  }

  async function updateShare(options: { shareEnabled: boolean; shareToken?: string; regenerate?: boolean }) {
    if (!shareTarget) return;
    setShareSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        shareEnabled: options.shareEnabled,
      };
      if (options.regenerate) body.regenerate = true;
      if (options.shareToken) body.shareToken = options.shareToken;
      const response = await apiFetch<{ shareEnabled: boolean; shareToken: string | null }>(
        `/api/configs/${shareTarget.id}/share`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      setConfigs((prev) =>
        prev.map((config) =>
          config.id === shareTarget.id
            ? { ...config, share_enabled: response.shareEnabled, share_token: response.shareToken }
            : config
        )
      );
      setShareTarget((prev) =>
        prev ? { ...prev, share_enabled: response.shareEnabled, share_token: response.shareToken } : prev
      );
      setShareEnabled(response.shareEnabled);
      setShareToken(response.shareToken ?? "");
      setAlert({
        type: "success",
        title: "Share settings updated",
        message: "Share token updated successfully.",
      });
      if (!response.shareEnabled) {
        setShareTarget(null);
      }
    } catch (error) {
      console.error("Failed to update share settings", error);
      setAlert({
        type: "error",
        title: "Failed to update share settings",
        message: error instanceof Error ? error.message : "Unexpected error updating share settings.",
      });
    } finally {
      setShareSubmitting(false);
    }
  }

  async function handleUpdateConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    if (!editName.trim() || !editBaseId) {
      setAlert({
        type: "error",
        title: "Missing fields",
        message: "Provide a name and choose a base config.",
      });
      return;
    }
    setEditSubmitting(true);
    try {
      const payload = {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        baseConfigId: editBaseId,
        groupIds: Array.from(editGroupSelection),
        selectorTags: normalizeSelectors(editSelectors),
      };
      const updated = await apiFetch<ConfigSummary>(`/api/configs/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const baseName =
        updated.base_config_name ??
        baseConfigs.find((base) => base.id === updated.base_config_id)?.name ??
        null;
      const updatedConfig: ConfigSummary = {
        ...updated,
        base_config_name: baseName,
        group_ids: updated.group_ids ?? Array.from(editGroupSelection),
      };
      setConfigs((prev) => prev.map((config) => (config.id === updatedConfig.id ? updatedConfig : config)));
      setAlert({
        type: "success",
        title: "Config updated",
        message: "Changes saved successfully.",
      });
      setEditTarget(null);
    } catch (error) {
      console.error("Failed to update config", error);
      setAlert({
        type: "error",
        title: "Failed to update config",
        message: error instanceof Error ? error.message : "Unexpected error updating the config.",
      });
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteConfig() {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    try {
      await apiFetch(`/api/configs/${deleteTarget.id}`, {
        method: "DELETE",
      });
      setConfigs((prev) => prev.filter((config) => config.id !== deleteTarget.id));
      setAlert({
        type: "success",
        title: "Config deleted",
        message: "Rendered configuration removed.",
      });
    } catch (error) {
      console.error("Failed to delete config", error);
      setAlert({
        type: "error",
        title: "Failed to delete config",
        message: error instanceof Error ? error.message : "Unexpected error deleting the config.",
      });
    } finally {
      setDeleteTarget(null);
      setEditTarget((prev) => (prev?.id === deletedId ? null : prev));
    }
  }

  function buildShareUrl(config: ConfigSummary, token?: string | null) {
    if (!host) return "";
    const trimmedHost = host.replace(/\/+$/, "");
    const url = new URL(`/api/config`, trimmedHost);
    url.searchParams.set("config_id", config.id);
    const actualToken = (token ?? config.share_token)?.trim();
    if (actualToken) url.searchParams.set("share", actualToken);
    return url.toString();
  }

  function buildSubscriptionShareUrl(config: ConfigSummary, token?: string | null) {
    if (!host) return "";
    const trimmedHost = host.replace(/\/+$/, "");
    const url = new URL(`/api/sub`, trimmedHost);
    url.searchParams.set("config_id", config.id);
    const actualToken = (token ?? config.share_token)?.trim();
    if (actualToken) {
      url.searchParams.set("share", actualToken);
    }
    return url.toString();
  }

  const normalizedShareToken = (shareToken || shareTarget?.share_token || "").trim();

  const shareConfigUrl =
    shareTarget && shareEnabled && normalizedShareToken
      ? buildShareUrl(shareTarget, normalizedShareToken)
      : "";
  const shareSubscriptionUrl =
    shareTarget && shareEnabled && normalizedShareToken
      ? buildSubscriptionShareUrl(shareTarget, normalizedShareToken)
      : "";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-16 items-center gap-2 border-b bg-background px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-5" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Sing-box Configs</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              setCreateDialogOpen(open);
              if (!open) resetCreateForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>Create config</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New rendered config</DialogTitle>
                <DialogDescription>Select a template and groups to generate a config.</DialogDescription>
              </DialogHeader>
              <form className="flex flex-col gap-4" onSubmit={handleCreate}>
                <div className="grid gap-2">
                  <Label htmlFor="config-name">Name</Label>
                  <Input
                    id="config-name"
                    placeholder="SBSM Profile"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="config-description">Description</Label>
                  <Textarea
                    id="config-description"
                    placeholder="Optional notes."
                    value={createDescription}
                    onChange={(event) => setCreateDescription(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Base config</Label>
                  <Select value={createBaseId} onValueChange={setCreateBaseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select base template" />
                    </SelectTrigger>
                    <SelectContent>
                      {baseConfigs.map((base) => (
                        <SelectItem key={base.id} value={base.id}>
                          {base.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Attach groups</Label>
                  <div className="max-h-48 overflow-y-auto rounded-lg border p-3">
                    {groups.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Create groups to attach VPN nodes.</p>
                    ) : (
                      <div className="space-y-2">
                        {groups.map((group) => (
                          <label key={group.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={createGroupSelection.has(group.id)}
                              onCheckedChange={() => toggleCreateGroup(group.id)}
                            />
                            <span className="flex flex-col">
                              <span className="font-medium leading-none">{group.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {group.type === "subscription" ? "Subscription" : "Manual"} group
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="config-selectors">Override selector tags</Label>
                  <Input
                    id="config-selectors"
                    placeholder="Comma-separated tags"
                    value={createSelectors}
                    onChange={(event) => setCreateSelectors(event.target.value)}
                  />
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={createShareEnabled}
                      onCheckedChange={(checked) => setCreateShareEnabled(Boolean(checked))}
                    />
                    <div>
                      <p className="text-sm font-medium">Enable share link</p>
                      <p className="text-xs text-muted-foreground">
                        Generates a share token so you can distribute a read-only link.
                      </p>
                    </div>
                  </div>
                  {createShareEnabled && (
                    <div className="grid gap-2">
                      <Label htmlFor="config-share-token">Share token (optional)</Label>
                      <Input
                        id="config-share-token"
                        placeholder="Leave blank to auto-generate"
                        value={createShareToken}
                        onChange={(event) => setCreateShareToken(event.target.value)}
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving…" : "Save config"}
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
            <CardTitle className="text-lg">Rendered configs</CardTitle>
            {loading ? <span className="text-sm text-muted-foreground">Loading…</span> : null}
          </CardHeader>
          <CardContent>
            {sortedConfigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                {loading ? "Fetching configs from the worker…" : "No rendered configs yet. Create one to share."}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Groups</TableHead>
                      <TableHead>Share</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedConfigs.map((config) => {
                      const groupNames = config.group_ids
                        .map((id) => groupLookup.get(id) ?? id)
                        .filter((name) => name.length > 0);
                      const selectorLabels = config.selector_tags;
                      return (
                        <TableRow key={config.id}>
                          <TableCell className="font-medium">{config.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {config.base_config_name ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {groupNames.length > 0 ? groupNames.join(", ") : "—"}
                            {selectorLabels.length > 0 ? (
                              <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">
                                selectors: {selectorLabels.join(", ")}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {config.share_enabled ? "Enabled" : "Disabled"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(buildShareUrl(config) || undefined, "_blank")}
                                disabled={!host}
                              >
                                View
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(config)}>
                                Edit
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openShareDialog(config)}>
                                Share
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <p className="mt-4 text-sm text-muted-foreground">
                  Rendered configs combine templates with VPN groups and share tokens.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditSubmitting(false);
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit rendered config</DialogTitle>
            <DialogDescription>Update metadata, base template, and attached groups.</DialogDescription>
          </DialogHeader>
          {editTarget && (
            <form className="flex flex-col gap-4" onSubmit={handleUpdateConfig}>
              <div className="grid gap-2">
                <Label htmlFor="edit-config-name">Name</Label>
                <Input
                  id="edit-config-name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-config-description">Description</Label>
                <Textarea
                  id="edit-config-description"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Base config</Label>
                <Select value={editBaseId} onValueChange={setEditBaseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select base template" />
                  </SelectTrigger>
                  <SelectContent>
                    {baseConfigs.map((base) => (
                      <SelectItem key={base.id} value={base.id}>
                        {base.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Attach groups</Label>
                <div className="max-h-48 overflow-y-auto rounded-lg border p-3">
                  {groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Create groups to attach VPN nodes.</p>
                  ) : (
                    <div className="space-y-2">
                      {groups.map((group) => (
                        <label key={group.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={editGroupSelection.has(group.id)}
                            onCheckedChange={() => toggleEditGroup(group.id)}
                          />
                          <span className="flex flex-col">
                            <span className="font-medium leading-none">{group.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {group.type === "subscription" ? "Subscription" : "Manual"} group
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-config-selectors">Override selector tags</Label>
                <Input
                  id="edit-config-selectors"
                  value={editSelectors}
                  onChange={(event) => setEditSelectors(event.target.value)}
                />
              </div>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-destructive">Delete config</p>
                    <p className="text-xs text-muted-foreground">
                      This removes the rendered config and invalidates existing share links.
                    </p>
                  </div>
                  <Button type="button" variant="destructive" onClick={() => setDeleteTarget(editTarget)}>
                    Delete
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditTarget(null);
                    setEditSubmitting(false);
                    setDeleteTarget(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editSubmitting}>
                  {editSubmitting ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(shareTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setShareTarget(null);
            setShareSubmitting(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {shareTarget?.name}</DialogTitle>
            <DialogDescription>Enable the public link or regenerate the share token.</DialogDescription>
          </DialogHeader>
          {shareTarget && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={shareEnabled} onCheckedChange={(checked) => setShareEnabled(Boolean(checked))} />
                <div>
                  <p className="text-sm font-medium">Enable share link</p>
                  <p className="text-xs text-muted-foreground">
                    Disable access to invalidate the URL immediately.
                  </p>
                </div>
              </div>
              {shareEnabled && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="share-token">Share token</Label>
                    <Input
                      id="share-token"
                      value={shareToken}
                      onChange={(event) => setShareToken(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="share-config-link">Config JSON link</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="share-config-link"
                          value={shareConfigUrl}
                          readOnly
                          placeholder={host ? "" : "Set host to generate links"}
                          className="sm:flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (!shareTarget || !normalizedShareToken) return;
                            const url = buildShareUrl(shareTarget, normalizedShareToken);
                            if (url) navigator.clipboard?.writeText(url);
                          }}
                          disabled={!shareTarget || !shareConfigUrl}
                        >
                          Copy config link
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="share-subscription-link">Subscription link</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="share-subscription-link"
                          value={shareSubscriptionUrl}
                          readOnly
                          placeholder={host ? "" : "Set host to generate links"}
                          className="sm:flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (!shareTarget || !normalizedShareToken) return;
                            const url = buildSubscriptionShareUrl(shareTarget, normalizedShareToken);
                            if (url) navigator.clipboard?.writeText(url);
                          }}
                          disabled={!shareTarget || !shareSubscriptionUrl}
                        >
                          Copy subscription link
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => updateShare({ shareEnabled: true, regenerate: true })}
                      disabled={shareSubmitting}
                    >
                      {shareSubmitting ? "Updating…" : "Regenerate"}
                    </Button>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShareTarget(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={shareSubmitting}
                  onClick={() => updateShare({ shareEnabled, shareToken: shareToken.trim() || undefined })}
                >
                  {shareSubmitting ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the rendered config and invalidates any share links issued for it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteConfig()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
