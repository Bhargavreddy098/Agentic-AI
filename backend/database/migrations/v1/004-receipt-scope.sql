-- Forward-only correction: a receipt must reference an event in its own workspace.
ALTER TABLE control.outbox
    ADD CONSTRAINT uq_outbox_workspace_event UNIQUE (workspace_id, event_id);
ALTER TABLE control.consumer_receipts
    ADD CONSTRAINT fk_receipts_workspace_event
    FOREIGN KEY (workspace_id, event_id)
    REFERENCES control.outbox (workspace_id, event_id) ON DELETE RESTRICT;
