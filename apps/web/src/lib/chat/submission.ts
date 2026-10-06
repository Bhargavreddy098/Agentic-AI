import { SendMessageInputSchema, type SendMessageInput, type UiCommandResult } from "@asi/contracts";
export class SubmissionController {
  pending: SendMessageInput | null = null;
  confirmedRevision = 0;
  private inFlight: Promise<UiCommandResult> | null = null;
  constructor(private readonly send: (input: SendMessageInput) => Promise<UiCommandResult>) {}
  submit(create: () => SendMessageInput): Promise<UiCommandResult> {
    if (this.inFlight) return this.inFlight;
    this.pending ??= SendMessageInputSchema.parse(create());
    this.inFlight = this.send(this.pending).then(result => { if (result.commandId !== this.pending?.commandId) throw new Error("Gateway acknowledgement identity mismatch"); this.confirmedRevision = Math.max(this.confirmedRevision, result.revision); this.pending = null; return result; }).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
}
