export function createGatewayController(gatewayService) {
    const workspace = res => res.locals.session.principal.workspaceId;

    return {
        async createDurableConversation(req, res) {
            const out = await gatewayService.createCoreConversation(workspace(res), req.body, req.body?.commandId);
            res.status(out.status === 'created' ? 201 : 200).json(out);
        },
        async getDurableConversation(req, res) {
            res.json(await gatewayService.getCoreConversation(workspace(res), req.params.id));
        },
        async createDurableGoal(req, res) {
            const out = await gatewayService.createCoreGoal(workspace(res), req.body, req.body?.commandId);
            res.status(out.status === 'created' ? 201 : 200).json(out);
        },
        async getDurableGoal(req, res) {
            res.json(await gatewayService.getCoreGoal(workspace(res), req.params.id));
        },
    };
}
