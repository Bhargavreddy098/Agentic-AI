"use client";
import { useState } from "react";
import type { Catalog, SkillView } from "@asi/contracts";
import { filterSkills, isSkillSelectable, skillSelectabilityReason } from "./catalog";

const STATUS_LABELS: Record<SkillView["status"], string> = { enabled: "Enabled", disabled: "Disabled", unavailable: "Unavailable" };
const TRUST_LABELS: Record<SkillView["trustStatus"], string> = { verified: "Verified", pending: "Pending", revoked: "Revoked" };

export function SkillCatalog({ catalog, selected = [], onSelectionChange, onCommand, historicReferences = [] }: {
  catalog: Catalog<SkillView> | null;
  selected?: readonly string[];
  onSelectionChange?: (next: string[]) => void;
  onCommand?: (action: "install" | "enable" | "disable" | "revoke", skill: SkillView) => void;
  historicReferences?: readonly string[];
}) {
  const [query, setQuery] = useState("");
  if (!catalog) return <p role="status" data-testid="skill-catalog-status">Skills loading…</p>;
  if (catalog.availability !== "ready") return <p role="status" data-testid="skill-catalog-status">{catalog.availability === "permission_denied" ? "Permission denied for skill access in this workspace." : "Skills are unavailable."}{catalog.reason ? ` (${catalog.reason})` : ""}</p>;
  if (catalog.items.length === 0) return <p role="status" data-testid="skill-catalog-status">No skills are available to this workspace.</p>;
  const items = filterSkills(catalog.items, query);
  const present = new Set(catalog.items.map(skill => skill.skillId));
  const historic = historicReferences.filter(id => !present.has(id));
  const toggle = (skillId: string, next: boolean) => { const set = new Set(selected); if (next) set.add(skillId); else set.delete(skillId); onSelectionChange?.([...set]); };
  return (
    <div className="skill-catalog" data-testid="skill-catalog">
      <label htmlFor="skill-search">Search skills</label>
      <input id="skill-search" className="skill-search" value={query} onChange={event => setQuery(event.target.value)} />
      {items.length === 0 ? <p className="skill-empty" data-testid="skill-catalog-status">No skills match this search.</p> : (
        <ul className="skill-list">
          {items.map(skill => {
            const selectable = isSkillSelectable(skill);
            const reason = skillSelectabilityReason(skill);
            const can = (action: string) => skill.allowedActions.includes(action);
            return (
              <li key={skill.skillId} className="skill-row" data-testid={`skill-${skill.skillId}`} data-status={skill.status} data-trust={skill.trustStatus}>
                <span className="skill-name">{skill.displayName}</span>
                <span className="skill-version">v{skill.skillVersion}</span>
                <span className="skill-status">{STATUS_LABELS[skill.status]}</span>
                <span className="skill-trust">{TRUST_LABELS[skill.trustStatus]}</span>
                <span className="skill-description">{skill.description}</span>
                <label className="skill-select-label" htmlFor={`skill-select-${skill.skillId}`}>Use in next run</label>
                <input id={`skill-select-${skill.skillId}`} data-testid={`skill-select-${skill.skillId}`} type="checkbox" disabled={!selectable} checked={selected.includes(skill.skillId)} onChange={event => toggle(skill.skillId, event.target.checked)} />
                {!selectable && reason ? <span className="skill-reason" data-testid={`skill-reason-${skill.skillId}`}>{reason}</span> : null}
                {can("skill.install") ? <button type="button" onClick={() => onCommand?.("install", skill)}>Install</button> : null}
                {can("skill.enable") ? <button type="button" onClick={() => onCommand?.("enable", skill)}>Enable</button> : null}
                {can("skill.disable") ? <button type="button" onClick={() => onCommand?.("disable", skill)}>Disable</button> : null}
                {can("skill.revoke") ? <button type="button" onClick={() => onCommand?.("revoke", skill)}>Revoke</button> : null}
              </li>
            );
          })}
        </ul>
      )}
      {historic.length > 0 ? (
        <ul className="skill-historic-list">
          {historic.map(id => (
            <li key={id} className="skill-historic-row" data-testid={`skill-historic-${id}`}>
              <span className="skill-historic-name">{id}</span>
              <span className="skill-historic-note">Historical reference (read-only)</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default SkillCatalog;
