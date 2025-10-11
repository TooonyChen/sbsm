"use client";

import { Github } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_SECTIONS } from "@/lib/navigation";
import { getAuthCookies } from "@/lib/auth-client";
import { ModeToggle } from "@/components/mode-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    const { host } = getAuthCookies();
    if (host) {
      setEndpoint(host.replace(/^https?:\/\//, ""));
    }
  }, [pathname]);

  return (
    <Sidebar {...props}>
      <SidebarHeader className="space-y-1.5 px-4 pb-2 pt-6">
        <div>
          <div className="flex items-center gap-2">
            <Image
              src="/sing-box-icon.svg"
              alt="Sing Box logo"
              width={20}
              height={20}
              className="size-5"
              priority
            />
            <p className="text-base font-semibold leading-tight tracking-tight">SBSM</p>
          </div>
          <p className="text-xs text-muted-foreground leading-tight">Sing Box Subscription Manager</p>
        </div>
        {endpoint && (
          <p className="text-xs text-muted-foreground truncate" title={endpoint}>
            {endpoint}
          </p>
        )}
      </SidebarHeader>
      <SidebarContent>
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link href={item.href} className="gap-2">
                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                          <span className={cn("truncate", active && "font-medium")}>
                            {item.title}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="px-4 pb-4 pt-2">
        <div className="flex items-center justify-between gap-2">
          <ModeToggle />
          <a
            href="https://github.com/TooonyChen/sbsm"
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Open the SBSM GitHub repository"
          >
            <Github className="size-5" strokeWidth={1.75} />
          </a>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
