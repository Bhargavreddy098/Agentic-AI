import { apiError } from '../middlewares/error-handler.js';
export function conversationService(control) {
    return {
        list: (...args) => control.list(...args), create: (...args) => control.create(...args), update: (...args) => control.patch(...args),
        async read(workspace, id) { const record = await control.read(workspace, id); if (!record)
            throw apiError('POLICY_DENIED', 'Conversation unavailable.', 404); return record; },
        send: (...args) => control.appendMessage(...args),
    };
}
