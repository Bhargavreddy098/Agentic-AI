import { encodeEvent, replayEvents } from '@asi/gateway/ui';
import { apiError } from '../middlewares/error-handler.js';
export function eventsController({ control, episodes }) {
    return async (req, res) => {
        if (!control || !episodes)
            throw apiError('DEPENDENCY_UNAVAILABLE', 'Transcript service is unavailable.', 503);
        const workspace = res.locals.session.principal.workspaceId;
        if (!await control.read(workspace, req.params.id))
            throw apiError('POLICY_DENIED', 'Conversation unavailable.', 404);
        const after = Number(req.query.after ?? 0);
        if (!Number.isSafeInteger(after) || after < 0)
            throw apiError('INVALID_INPUT', 'Event cursor is invalid.');
        const events = replayEvents(await episodes.readEvents(workspace, req.params.id, after), after);
        if (req.destroyed)
            return;
        res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
        for (const event of events) {
            if (res.destroyed)
                break;
            res.write(encodeEvent(event));
        }
        res.end();
    };
}
