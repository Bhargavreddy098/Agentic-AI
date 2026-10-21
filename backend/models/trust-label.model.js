import { UntrustedInputSchema, TrustLabelledInputSchema } from '../schemas/trust-label.schema.js';
import { ModelDomainError, validateContext, parseSchema } from './_shared.js';

export function createTrustLabelModel() {
    return {
        async labelInput(input, context) {
            validateContext(context);
            if (input?.instructionTrust && input.instructionTrust !== 'untrusted_data') {
                throw new ModelDomainError('POLICY_DENIED', 'External or retrieved input must always be labelled untrusted_data.', 403);
            }
            const parsed = parseSchema(UntrustedInputSchema, input, 'Invalid untrusted input');
            const flags = [...parsed.suspiciousPatterns];
            if (!flags.includes(`origin:${parsed.origin}`)) {
                flags.push(`origin:${parsed.origin}`);
            }
            const quarantineRef = parsed.suspiciousPatterns.length > 0 ? `quarantine-${parsed.inputRef}` : null;
            return parseSchema(TrustLabelledInputSchema, {
                inputRef: parsed.inputRef,
                origin: parsed.origin,
                observedDigest: parsed.observedDigest,
                contentRef: parsed.contentRef,
                instructionTrust: 'untrusted_data',
                flags,
                quarantineRef,
            });
        },
    };
}
