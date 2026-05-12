export interface JoinQueuePayload {
  mode?: 'ranked';
}

export interface MatchFoundPayload {
  roomId: string;
}

export interface ClientToServerEvents {
  join_queue: (payload?: JoinQueuePayload) => void;
  join_battle: (payload: { roomId: string }) => void;
}

export interface ServerToClientEvents {
  match_found: (payload: MatchFoundPayload) => void;
}
