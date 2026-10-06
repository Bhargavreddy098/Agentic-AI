# UI-0002 — Qualified presentation subset

Date: 2026-10-06. Authorized scope: implement remaining tasks with the requested UI libraries; primary AI Elements choice already recorded in approved baseline.

Preserve Next/React/Tailwind, AI Elements presentation, shadcn primitives, exactly seven main sections, one GatewayClient and one application conversation store. Approvals and questions stay in Chat.

Selected sources: pinned AI Elements Conversation/Message presentation subsets; pinned shadcn new-york-v4 Radix Button/Textarea. Upstream copies, licenses and local digests are in the component inventory. Local changes map imports, narrow message roles to safe local types, and add the scroll-button accessible name. Copying the presentation does not authorize upstream examples that create a model generation route.

Ruling: use the reviewed presentation subset without installing AI SDK in the browser. Download helpers, rich-content plugins, microphone/screen capture and library-owned prompt context are outside the current capabilities and not selected. Controlled composer will use the qualified project Textarea/Button adapters at U06. Cost if wrong: additional chat features require separately qualified wrappers; no API/state migration is needed.

All eleven user-supplied sources retain explicit catalog entries. Other libraries are references/alternatives/pending, with no invented source qualification. Selected shadcn is an additional common foundation source. Exact direct pins, integrity, license, peer/engine metadata are captured from npm; strict installation, typecheck, Next build and browser smoke are the compatibility evidence. No remote installer is executed.

The dependency inventory promotion does not approve real inference, model credentials, deployment or policy-sensitive execution. Remaining backend/live gates remain in force.
