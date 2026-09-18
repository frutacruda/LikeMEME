export type RoomStatus = "waiting" | "playing" | "round_1_complete";

export type RoomPlayer = {
  id: string;
  nickname: string;
  seat: number;
  is_host: boolean;
  camera_ready: boolean;
};

export type RoundScore = {
  player_id: string;
  expression: number;
  pose: number;
  style: number;
  total: number;
  is_winner: boolean;
};

export type RoundSnapshot = {
  id: string;
  number: 1;
  reference_meme_id: string;
  reference_image_path: string;
  key_category: "expression" | "pose" | "style";
  starts_at: string;
  status: "scheduled" | "judging" | "complete" | "invalid";
  submitted_player_ids: string[];
  scores: RoundScore[];
};

export type RoomSnapshot = {
  id: string;
  code: string;
  status: RoomStatus;
  is_host: boolean;
  current_player_id: string;
  players: RoomPlayer[];
  round: RoundSnapshot | null;
};
