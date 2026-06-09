import { getTasks, getAllAssignees } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { prisma } from "@/lib/prisma";
import { TasksList } from "./tasks-list";
import { AssigneeFilter } from "./assignee-filter";
import { Suspense } from "react";

interface PageProps {
  searchParams: Promise<{ assignee?: string }>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const { assignee } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
  const { tasks } = await getTasks(assignee);
  const assignees = await getAllAssignees();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F7F8" }}>
      <Navbar user={{ ...session.user, isAdmin: user?.isAdmin }} />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold" style={{ color: "#26262C" }}>Tâches</h1>
          {assignees.length > 0 && (
            <Suspense fallback={null}>
              <AssigneeFilter assignees={assignees} current={assignee} />
            </Suspense>
          )}
        </div>
        <TasksList tasks={tasks} />
      </main>
    </div>
  );
}
