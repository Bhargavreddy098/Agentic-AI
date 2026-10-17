"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskView } from "@asi/contracts";
import { useWorkspace } from "../shell/WorkspaceProvider";
import { cancelTask, reconcileTasks } from "./activity";
import { ActivityTasks } from "./ActivityTasks";

export default function ActivityPage() {
  const { client } = useWorkspace();
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const page = await client.getActivity({ limit: 50 });
        if (active) setTasks(previous => page.items.reduce((accumulator, item) => reconcileTasks(accumulator, item), previous));
      } catch { /* keep the previously shown activity */ }
    })();
    return () => { active = false; };
  }, [client]);

  return (
    <main className="section-page">
      <div className="section-kicker">WORKSPACE</div>
      <h1>Activity &amp; Tasks</h1>
      <p className="section-lede">Follow runs, specialist tasks, tool outcomes and usage. Decisions are made in the owning Chat, never here.</p>
      {notice ? <p role="status" className="section-notice">{notice}</p> : null}
      <ActivityTasks
        tasks={tasks}
        onCancel={async task => {
          const outcome = await cancelTask(client, task, crypto.randomUUID());
          if (outcome.kind === "applied") setNotice("Cancellation requested.");
          else if (outcome.kind === "error") setNotice(outcome.message);
        }}
        onOpenDecision={href => router.push(href)}
      />
    </main>
  );
}
