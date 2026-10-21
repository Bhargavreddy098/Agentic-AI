import { apiError } from '../../../../middlewares/error-handler.js';

const ctxOf = res => res.locals.tenantContext;

export function createEpisodeController(episodeService) {
    return {
        async append(req, res) {
            const out = await episodeService.appendEpisode(req.body, ctxOf(res));
            res.status(out.status === 'created' ? 201 : 200).json(out);
        },
        async search(req, res) {
            res.json(await episodeService.searchEpisodes(req.query, ctxOf(res)));
        },
        async replay(req, res) {
            res.json(await episodeService.replaySession(req.params.sessionId, ctxOf(res)));
        },
        async appendLineage(req, res) {
            const out = await episodeService.appendCompressionLineage(req.body, ctxOf(res));
            res.status(201).json(out);
        },
        async getLineage(req, res) {
            const record = await episodeService.getCompressionLineage(req.params.id, ctxOf(res));
            if (!record) throw apiError('NOT_FOUND', 'Compression lineage not found.', 404);
            res.json(record);
        },
    };
}
