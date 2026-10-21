import { apiError } from '../middlewares/error-handler.js';
import { validate } from '../middlewares/validate.js';
import { ClarificationAnswerSchema, ApprovalDecisionInputSchema, UploadIntentSchema, MemorySearchInputSchema, ActivityQuerySchema, UiMutationCommandSchema } from '../schemas/index.js';
import { unavailableCatalog, unavailableSettings } from '../services/catalog.service.js';
const workspace = res => res.locals.session.principal.workspaceId;
const commandId = req => { const id = req.body?.commandId; if (typeof id !== 'string' || !id || id.length > 128)
    throw apiError('INVALID_INPUT', 'Command identity required.'); return id; };
/** @param {{control?: import('@asi/gateway/ui').UiControlPort, catalogs?: import('@asi/gateway/ui').UiCatalogPorts, commands?: Function, quarantine: import('@asi/gateway/ui').UploadQuarantine}} options */
export function domainController({ control, catalogs = {}, commands, quarantine }) {
    const owner = () => { if (!control)
        throw apiError('DEPENDENCY_UNAVAILABLE', 'Operation is unavailable.', 503); return control; };
    return {
        async cancel(req, res) { res.json(await owner().cancelRun(workspace(res), req.params.id, commandId(req))); },
        async answer(req, res) { res.json(await owner().answerClarification(workspace(res), req.params.id, validate(ClarificationAnswerSchema, req.body))); },
        async approve(req, res) { res.json(await owner().decideApproval(workspace(res), req.params.id, validate(ApprovalDecisionInputSchema, req.body))); },
        async command(req, res) { const input = validate(UiMutationCommandSchema, req.body); res.json(await (commands ?? ((scope, command) => owner().submitCommand(scope, command)))(workspace(res), input)); },
        catalog: kind => async (_req, res) => res.json(catalogs[kind] ? await catalogs[kind](workspace(res)) : unavailableCatalog()),
        async memory(req, res) { const input = validate(MemorySearchInputSchema, { ...req.query, query: req.query.query ?? '', limit: Number(req.query.limit ?? 50) }); res.json(catalogs.memory ? await catalogs.memory(workspace(res), input) : { items: [], nextCursor: null }); },
        async activity(req, res) { const input = validate(ActivityQuerySchema, { ...req.query, limit: Number(req.query.limit ?? 50) }); res.json(catalogs.activity ? await catalogs.activity(workspace(res), input) : { items: [], nextCursor: null }); },
        async settings(_req, res) { res.json(catalogs.settings ? await catalogs.settings(workspace(res)) : unavailableSettings()); },
        uploadBegin(req, res) { res.json(quarantine.begin(workspace(res), validate(UploadIntentSchema, req.body))); },
        uploadWrite(req, res) { if (!Buffer.isBuffer(req.body))
            throw apiError('INVALID_INPUT', 'Upload content is required.'); const result = quarantine.write(workspace(res), req.params.id, req.body); if (!result.ok)
            throw apiError(result.code, result.message, 403); res.status(204).end(); },
        async uploadComplete(req, res) { const id = commandId(req); const view = await quarantine.complete(workspace(res), req.params.id, id); if (!view)
            throw apiError('INVALID_INPUT', 'Upload unavailable.', 404); res.json(view); },
        uploadView(req, res) { const view = quarantine.view(workspace(res), req.params.id); if (!view)
            throw apiError('INVALID_INPUT', 'Upload unavailable.', 404); res.json(view); },
    };
}
