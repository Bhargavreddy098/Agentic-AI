"use client";

import {
  createLibrary,
  defineComponent,
  useTriggerAction,
} from "@openuidev/react-lang";
import type {
  ComponentRenderProps,
  PromptOptions,
} from "@openuidev/react-lang";
import { z } from "zod/v4";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Button } from "@/components/motion/button/base";

const Stack = defineComponent({
  name: "Stack",
  description:
    "Vertical layout container. Use it as the root of every reply and stack children in reading order.",
  props: z.object({
    children: z.array(z.unknown()).describe("Ordered child components"),
  }),
  component: ({ props, renderNode }) => (
    <div className="flex flex-col gap-3">
      {(Array.isArray(props.children) ? props.children : []).map(
        (child, index) => (
          <div key={index}>{renderNode(child)}</div>
        ),
      )}
    </div>
  ),
});

const Text = defineComponent({
  name: "Text",
  description:
    "A paragraph of prose. The default for written content; keep each one under four sentences.",
  props: z.object({
    value: z.string().describe("The paragraph text"),
    muted: z
      .boolean()
      .optional()
      .describe("Render smaller and de-emphasized"),
  }),
  component: ({ props }) =>
    props.muted ? (
      <p className="text-sm leading-6 text-muted-foreground">{props.value}</p>
    ) : (
      <p className="text-[15px] leading-7 text-foreground">{props.value}</p>
    ),
});

const Heading = defineComponent({
  name: "Heading",
  description:
    "A short section title. Use sparingly, only when a reply has distinct sections.",
  props: z.object({
    value: z.string().describe("The title text"),
  }),
  component: ({ props }) => (
    <h3 className="pt-1 text-base font-semibold tracking-tight text-foreground">
      {props.value}
    </h3>
  ),
});

const buttonProps = z.object({
  label: z.string().describe("Button text"),
  action: z.string().describe("The follow-up message sent when pressed"),
  variant: z
    .enum(["primary", "secondary", "ghost", "outline"])
    .optional()
    .describe("primary for the main action, secondary or ghost otherwise"),
});

type ButtonProps = z.infer<typeof buttonProps>;

function BeButtonRenderer({ props }: ComponentRenderProps<ButtonProps>) {
  const triggerAction = useTriggerAction();
  return (
    <Button
      variant={props.variant}
      size="sm"
      onClick={() => triggerAction(props.action)}
    >
      {props.label}
    </Button>
  );
}

const BeButton = defineComponent({
  name: "Button",
  description:
    "Spring-pressed action button. Its action sends a follow-up message back into the chat.",
  props: buttonProps,
  component: BeButtonRenderer,
});

const BeBadge = defineComponent({
  name: "Badge",
  description:
    "Status badge with an animated icon. Use it to label a state such as qualified, pending or blocked.",
  props: z.object({
    label: z.string().describe("The badge text"),
    status: z
      .enum(["neutral", "info", "success", "warning", "danger", "loading"])
      .optional()
      .describe("Semantic state shown by the icon and color"),
    size: z.enum(["sm", "md"]).optional().describe("Badge size"),
  }),
  component: ({ props }) => (
    <AnimatedBadge status={props.status} size={props.size}>
      {props.label}
    </AnimatedBadge>
  ),
});

const BeStat = defineComponent({
  name: "Stat",
  description:
    "A single key figure: one animated number with a small label. Use it for counts, versions and stage numbers.",
  props: z.object({
    label: z.string().describe("Short label under the value"),
    value: z.number().describe("The numeric figure to count up to"),
    suffix: z
      .string()
      .optional()
      .describe("Optional unit appended to the value, e.g. %"),
  }),
  component: ({ props }) => {
    const value = Number.isFinite(props.value) ? props.value : 0;
    return (
      <div className="w-fit rounded-lg border border-border bg-card px-3.5 py-2.5">
        <div className="font-mono text-lg font-semibold text-foreground">
          <AnimatedNumber
            value={value}
            format={(current) =>
              `${Math.round(current).toLocaleString()}${props.suffix ?? ""}`
            }
          />
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {props.label}
        </div>
      </div>
    );
  },
});

export const beuiLibrary = createLibrary({
  root: "Stack",
  id: "beui-openui",
  components: [Stack, Text, Heading, BeButton, BeBadge, BeStat],
  componentGroups: [
    {
      name: "Layout",
      components: ["Stack"],
      notes: ["Always use Stack as the root and nest it for grouped rows."],
    },
    {
      name: "Content",
      components: ["Text", "Heading"],
      notes: ["Prefer Text for prose and Heading only for real sections."],
    },
    {
      name: "Status",
      components: ["Badge", "Stat"],
      notes: [
        "Badge for state labels, Stat for a numeric figure with a caption.",
      ],
    },
    {
      name: "Interaction",
      components: ["Button"],
      notes: ["Offer at most three follow-up buttons per reply."],
    },
  ],
});

export const promptOptions: PromptOptions = {
  preamble:
    "You are the ASI console, the operator interface for a governed digital creation platform. Answer with a compact OpenUI Lang interface, never Markdown. Keep prose short and use Badge and Stat for status facts.",
  additionalRules: [
    "Never claim a roadmap stage is complete unless the conversation context says it is qualified.",
    "Use Button only for follow-up questions that make sense inside this console.",
    "Keep each reply to at most six components.",
  ],
  examples: [
    `root = Stack([title, summary, status, next])
title = Heading("Provider status")
summary = Text("Stage 06 is locally qualified. The official OpenAI target is still unverified.")
status = Badge("live-unverified", "warning")
next = Button("What is blocking stage 07?", "What is blocking stage 07?")`,
  ],
};
