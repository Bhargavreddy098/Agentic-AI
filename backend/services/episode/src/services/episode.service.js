import { createEpisodeModel } from '../models/index.js';

export function createEpisodeService(owners = {}) {
    const episodeModel = owners.episode ?? createEpisodeModel(owners);
    return {
        episodeModel,
        appendEpisode: (input, ctx) => episodeModel.appendEpisode(input, ctx),
        searchEpisodes: (query, ctx) => episodeModel.searchEpisodes(query, ctx),
        replaySession: (sessionId, ctx) => episodeModel.replaySession(sessionId, ctx),
        appendCompressionLineage: (input, ctx) => episodeModel.appendCompressionLineage(input, ctx),
        getCompressionLineage: (id, ctx) => episodeModel.getCompressionLineage(id, ctx),
    };
}
