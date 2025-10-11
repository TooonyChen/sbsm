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
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";

type BaseConfig = {
  id: string;
  name: string;
  description: string | null;
  selector_tags: string[];
  config: unknown;
  created_at: number;
  updated_at: number;
};

type AlertState =
  | { type: "success"; title: string; message: string }
  | { type: "error"; title: string; message: string }
  | null;

const EMPTY_TEMPLATE = JSON.stringify(
  {
    log: {},
    dns: {},
    ntp: {},
    certificate: {},
    endpoints: [],
    inbounds: [],
    outbounds: [],
    route: {},
    services: [],
    experimental: {},
  },
  null,
  2
);

export default function BaseConfigsPage() {
  const [configs, setConfigs] = useState<BaseConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<AlertState>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createConfigJson, setCreateConfigJson] = useState(EMPTY_TEMPLATE);
  const [createTagOptions, setCreateTagOptions] = useState<string[]>([]);
  const [createSelectedTags, setCreateSelectedTags] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<BaseConfig | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editConfigJson, setEditConfigJson] = useState(EMPTY_TEMPLATE);
  const [editTagOptions, setEditTagOptions] = useState<string[]>([]);
  const [editSelectedTags, setEditSelectedTags] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BaseConfig | null>(null);

  const sortedConfigs = useMemo(
    () => [...configs].sort((a, b) => b.updated_at - a.updated_at),
    [configs]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setAlert(null);
      try {
        const data = await apiFetch<BaseConfig[]>("/api/base-configs");
        if (!cancelled) {
          setConfigs(data);
        }
      } catch (error) {
        console.error("Failed to load base configs", error);
        if (!cancelled) {
          setAlert({
            type: "error",
            title: "Failed to load base configs",
            message: error instanceof Error ? error.message : "Unexpected error loading base configs.",
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

  function resetCreateForm() {
    setCreateName("");
    setCreateDescription("");
    setCreateConfigJson(EMPTY_TEMPLATE);
    setCreateTagOptions(extractOutboundTags(EMPTY_TEMPLATE));
    setCreateSelectedTags(new Set());
  }

  function openEditDialog(config: BaseConfig) {
    setEditTarget(config);
    setEditName(config.name);
    setEditDescription(config.description ?? "");
    setEditConfigJson(JSON.stringify(config.config, null, 2));
    const options = extractOutboundTags(config.config);
    setEditTagOptions(options);
    setEditSelectedTags(new Set(config.selector_tags.filter((tag) => options.includes(tag))));
  }

  function toggleTag(selection: Set<string>, tag: string): Set<string> {
    const next = new Set(selection);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    return next;
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function extractOutboundTags(config: unknown): string[] {
    try {
      const source = typeof config === "string" ? JSON.parse(config) : config;
      if (!isRecord(source)) return [];
      const outbounds = source.outbounds;
      if (!Array.isArray(outbounds)) return [];
      const tags: string[] = [];
      for (const outbound of outbounds) {
        if (!isRecord(outbound)) continue;
        const tagField = outbound.tag;
        const nameField = outbound.name;
        const value = typeof tagField === "string" ? tagField : typeof nameField === "string" ? nameField : null;
        if (value) tags.push(value);
      }
      return Array.from(new Set(tags));
    } catch {
      return [];
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createName.trim()) {
      setAlert({
        type: "error",
        title: "Missing name",
        message: "Please provide a base config name.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const parsed = JSON.parse(createConfigJson);
      const payload = {
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        selectorTags: Array.from(createSelectedTags),
        configJson: parsed,
      };
      const created = await apiFetch<BaseConfig>("/api/base-configs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setConfigs((prev) => [created, ...prev]);
      setAlert({
        type: "success",
        title: "Base config created",
        message: "Sing-box template saved successfully.",
      });
      resetCreateForm();
      setCreateDialogOpen(false);
    } catch (error) {
      console.error("Failed to create base config", error);
      if (error instanceof SyntaxError) {
        setAlert({
          type: "error",
          title: "Invalid JSON",
          message: "Please provide valid JSON for the sing-box template.",
        });
      } else {
        setAlert({
          type: "error",
          title: "Failed to create base config",
          message:
            error instanceof Error ? error.message : "Unexpected error while creating the base configuration.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    if (!editName.trim()) {
      setAlert({
        type: "error",
        title: "Missing name",
        message: "Please provide a base config name.",
      });
      return;
    }
    setEditing(true);
    try {
      const parsed = JSON.parse(editConfigJson);
      const payload = {
        name: editName.trim(),
        description: editDescription.trim(),
        selectorTags: Array.from(editSelectedTags),
        configJson: parsed,
      };
      const updated = await apiFetch<BaseConfig>(`/api/base-configs/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setConfigs((prev) => prev.map((config) => (config.id === updated.id ? updated : config)));
      setAlert({
        type: "success",
        title: "Base config updated",
        message: "Changes saved successfully.",
      });
      setEditTarget(null);
    } catch (error) {
      console.error("Failed to update base config", error);
      if (error instanceof SyntaxError) {
        setAlert({
          type: "error",
          title: "Invalid JSON",
          message: "Please provide valid JSON for the sing-box template.",
        });
      } else {
        setAlert({
          type: "error",
          title: "Failed to update base config",
          message: error instanceof Error ? error.message : "Unexpected error updating the base configuration.",
        });
      }
    } finally {
      setEditing(false);
    }
  }

  async function handleDeleteConfig() {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    try {
      await apiFetch(`/api/base-configs/${deletedId}`, {
        method: "DELETE",
      });
      setConfigs((prev) => prev.filter((config) => config.id !== deletedId));
      setAlert({
        type: "success",
        title: "Base config deleted",
        message: "Template removed successfully.",
      });
    } catch (error) {
      console.error("Failed to delete base config", error);
      setAlert({
        type: "error",
        title: "Failed to delete base config",
        message:
          error instanceof Error
            ? error.message
            : "Unexpected error deleting the base configuration.",
      });
    } finally {
      setDeleteTarget(null);
      setEditTarget((prev) => (prev?.id === deletedId ? null : prev));
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
              <BreadcrumbPage>Base Configs</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              setCreateDialogOpen(open);
              if (!open) resetCreateForm();
              if (open) {
                const options = extractOutboundTags(createConfigJson);
                setCreateTagOptions(options);
                setCreateSelectedTags((prev) => {
                  const next = new Set<string>();
                  for (const tag of options) {
                    if (prev.has(tag)) next.add(tag);
                  }
                  return next;
                });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>Create base config</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New sing-box template</DialogTitle>
                <DialogDescription>Provide template details and optional selector tags.</DialogDescription>
              </DialogHeader>
              <form className="flex flex-col gap-4" onSubmit={handleCreate}>
                <div className="grid gap-2">
                  <Label htmlFor="base-name">Name</Label>
                  <Input
                    id="base-name"
                    placeholder="Global sing-box template"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="base-description">Description</Label>
                  <Textarea
                    id="base-description"
                    placeholder="Optional notes."
                    value={createDescription}
                    onChange={(event) => setCreateDescription(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Selector tags</Label>
                  {createTagOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No outbound tags detected. Add `tag` values in your config JSON to enable selector choices.
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                      {createTagOptions.map((tag) => (
                        <label key={tag} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={createSelectedTags.has(tag)}
                            onCheckedChange={() =>
                              setCreateSelectedTags((prev) => toggleTag(prev, tag))
                            }
                          />
                          <span>{tag}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="base-config-json">Config JSON</Label>
                  <Textarea
                    id="base-config-json"
                    value={createConfigJson}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCreateConfigJson(value);
                      const options = extractOutboundTags(value);
                      setCreateTagOptions(options);
                      setCreateSelectedTags((prev) => {
                        const next = new Set<string>();
                        for (const tag of options) {
                          if (prev.has(tag)) next.add(tag);
                        }
                        return next;
                      });
                    }}
                    className="h-56 resize-y font-mono text-xs"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving…" : "Save template"}
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
            <CardTitle className="text-lg">Sing-box templates</CardTitle>
            {loading ? <span className="text-sm text-muted-foreground">Loading…</span> : null}
          </CardHeader>
          <CardContent>
            {sortedConfigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                {loading
                  ? "Fetching base configs from the worker…"
                  : "No base configs yet. Import one to start generating profiles."}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Selector tags</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedConfigs.map((config) => (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">{config.name}</TableCell>
                        <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                          {config.selector_tags.length > 0 ? config.selector_tags.join(", ") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(config.updated_at * 1000).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(config)}>
                              Edit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-4 text-sm text-muted-foreground">
                  Base configs act as templates for rendered sing-box profiles.
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
            setEditing(false);
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit base config</DialogTitle>
            <DialogDescription>Update template settings and selector tags.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleUpdate}>
            <div className="grid gap-2">
              <Label htmlFor="edit-base-name">Name</Label>
              <Input
                id="edit-base-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-base-description">Description</Label>
              <Textarea
                id="edit-base-description"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Selector tags</Label>
              {editTagOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No outbound tags detected. Add `tag` values in your config JSON to enable selector choices.
                </p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {editTagOptions.map((tag) => (
                    <label key={tag} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editSelectedTags.has(tag)}
                        onCheckedChange={() =>
                          setEditSelectedTags((prev) => toggleTag(prev, tag))
                        }
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-base-json">Config JSON</Label>
              <Textarea
                id="edit-base-json"
                value={editConfigJson}
                onChange={(event) => {
                  const value = event.target.value;
                  setEditConfigJson(value);
                  const options = extractOutboundTags(value);
                  setEditTagOptions(options);
                  setEditSelectedTags((prev) => {
                    const next = new Set<string>();
                    for (const tag of options) {
                      if (prev.has(tag)) next.add(tag);
                    }
                    return next;
                  });
                }}
                className="h-56 resize-y font-mono text-xs"
              />
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-destructive">Delete base config</p>
                  <p className="text-xs text-muted-foreground">
                    This removes the template. Configs referencing it must be updated manually.
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
                  setEditing(false);
                  setDeleteTarget(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editing}>
                {editing ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
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
              This action removes the base template. Configs referencing it must be updated manually.
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
