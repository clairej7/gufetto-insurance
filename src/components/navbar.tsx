"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutDashboard, LogOut, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    isAdmin?: boolean;
  };
  lastSyncAt?: Date | null;
}

export function Navbar({ user, lastSyncAt }: NavbarProps) {
  const pathname = usePathname();

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user.email?.[0] || "?").toUpperCase();

  return (
    <header className="bg-white border-b sticky top-0 z-50" style={{ borderColor: "#E8E8EC" }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo + Nav */}
          <div className="flex items-center gap-8">
            <Link href="/pipeline" className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#4E49FC" }}>
                <span className="text-white text-xs font-bold">M</span>
              </div>
              <span className="font-semibold text-sm" style={{ color: "#26262C" }}>
                Assurance MRI
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link
                href="/pipeline"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  pathname.startsWith("/pipeline")
                    ? "text-[#4E49FC] bg-[#F5F5FF]"
                    : "text-[#656576] hover:text-[#26262C] hover:bg-[#F7F7F8]"
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
                Pipeline
              </Link>
              <Link
                href="/tasks"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  pathname.startsWith("/tasks")
                    ? "text-[#4E49FC] bg-[#F5F5FF]"
                    : "text-[#656576] hover:text-[#26262C] hover:bg-[#F7F7F8]"
                )}
              >
                <CheckSquare className="h-4 w-4" />
                Mes tâches
              </Link>
              {user.isAdmin && (
                <>
                  <Link
                    href="/admin"
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      pathname === "/admin"
                        ? "text-[#4E49FC] bg-[#F5F5FF]"
                        : "text-[#656576] hover:text-[#26262C] hover:bg-[#F7F7F8]"
                    )}
                  >
                    Tracking
                  </Link>
                  <Link
                    href="/admin/activite"
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      pathname.startsWith("/admin/activite")
                        ? "text-[#4E49FC] bg-[#F5F5FF]"
                        : "text-[#656576] hover:text-[#26262C] hover:bg-[#F7F7F8]"
                    )}
                  >
                    Logs
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {lastSyncAt && (
              <span className="text-xs hidden sm:block" style={{ color: "#A2A1AF" }}>
                Actualisé le{" "}
                {new Date(lastSyncAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full focus:outline-none">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.image || ""} alt={user.name || ""} />
                  <AvatarFallback className="text-xs font-medium" style={{ backgroundColor: "#F5F5FF", color: "#4E49FC" }}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-xs" style={{ color: "#656576" }}>{user.email}</div>
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="cursor-pointer"
                  style={{ color: "#CA1E12" }}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
