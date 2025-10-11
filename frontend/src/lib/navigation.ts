import type React from "react";
import {
  Gauge,
  SquareStack,
  ListTree,
  Layers2,
  Cog,
  Network,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: Gauge,
      },
    ],
  },
  {
    label: "Resources",
    items: [
      {
        title: "VPN Nodes",
        href: "/nodes",
        icon: Network,
      },
      {
        title: "VPN Groups",
        href: "/groups",
        icon: ListTree,
      },
      {
        title: "Base Configs",
        href: "/base",
        icon: Layers2,
      },
      {
        title: "Sing-box Configs",
        href: "/config",
        icon: SquareStack,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "Connection",
        href: "/settings",
        icon: Cog,
      },
    ],
  },
];
