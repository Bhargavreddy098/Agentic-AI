import { projectSnapshot } from '@asi/gateway/ui';
import { conversationService } from '../services/conversation.service.js';
import { apiError } from '../middlewares/error-handler.js';
import { validate } from '../middlewares/validate.js';
import { ConversationPatchSchema, SendMessageInputSchema } from '../schemas/index.js';
export function conversationController({ control, limits, quarantine }) {
    const service = control ? conversationService(control) : null;
    const get = () => { if (!service)
        throw apiError('DEPENDENCY_UNAVAILABLE', 'Conversation service is unavailable.', 503); return service; };
    return {
        async list(req, res) { res.json(await get().list(res.locals.session.principal.workspaceId, req.query.cursor)); },
        async create(req, res) { const id = req.body?.commandId; if (typeof id !== 'string' || !id || id.length > 128)
            throw apiError('INVALID_INPUT', 'Command identity required.'); res.json(await get().create(res.locals.session.principal.workspaceId, id)); },
        async update(req, res) { res.json(await get().update(res.locals.session.principal.workspaceId, req.params.id, validate(ConversationPatchSchema, req.body))); },
        async snapshot(req, res) { res.json(projectSnapshot(await get().read(res.locals.session.principal.workspaceId, req.params.id))); },
        async send(req, res) {
            const input = validate(SendMessageInputSchema, req.body), workspace = res.locals.session.principal.workspaceId;
            if (Buffer.byteLength(input.text) > limits.maxMessageBytes)
                throw apiError('INVALID_INPUT', 'Message exceeds the workspace size limit.');
            if (input.attachmentIds.length > limits.maxAttachmentCount || input.attachmentIds.some(id => !quarantine.isReleased(workspace, id)))
                throw apiError('POLICY_DENIED', 'Attachment is not approved for run input.', 403);
            res.json(await get().send(workspace, req.params.id, input));
        },
    };
}
