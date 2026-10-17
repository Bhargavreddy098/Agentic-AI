"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SkillView } from "@asi/contracts";
import { useWorkspace } from "../shell/WorkspaceProvider";
import { SkillsProvider, useSkills, installSkill, enableSkill, disableSkill, revokeSkill } from "./catalog";
import { SkillCatalog } from "./SkillCatalog";

function SkillsView() {
  const { client } = useWorkspace();
  const router = useRouter();
  const { skills } = useSkills();
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const openInteraction = (href: string) => { setNotice("An approval was requested in Chat."); router.push(href); };
  const command = (action: "install" | "enable" | "disable" | "revoke") => async (skill: SkillView) => {
    const run = action === "install" ? installSkill : action === "enable" ? enableSkill : action === "disable" ? disableSkill : revokeSkill;
    const outcome = await run(client, skill, openInteraction);
    if (outcome.kind === "applied") setNotice(`${skill.displayName}: ${action}d.`);
    else if (outcome.kind === "error") setNotice(outcome.message);
  };

  return (
    <main className="section-page">
      <div className="section-kicker">WORKSPACE</div>
      <h1>Skills</h1>
      <p className="section-lede">Install verified skills and request them for the next run. A selection changes the next run only.</p>
      {notice ? <p role="status" className="section-notice">{notice}</p> : null}
      <SkillCatalog catalog={skills} selected={selected} onSelectionChange={setSelected} onCommand={(action, skill) => { void command(action)(skill); }} />
    </main>
  );
}

export default function SkillsPage() {
  const { client } = useWorkspace();
  return <SkillsProvider client={client}><SkillsView /></SkillsProvider>;
}
