export { SlackAdapter, createSlackAdapter } from "./slack.js";
export type { SlackConfig, SlackEvent, SlackEventPayload } from "./slack.js";
export type { ChannelAdapter, ChannelConfig, NormalizedEvent, HttpChannelConfig, WebSocketChannelConfig } from "./port.js";
export { BaseChannelAdapter, HttpChannelAdapter, WebSocketChannelAdapter, createChannelAdapter } from "./port.js";