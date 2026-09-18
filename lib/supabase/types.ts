export type RoomStatus = "waiting" | "playing" | "finished";

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
  number: 1 | 2 | 3 | 4 | 5;
  reference_meme_id: string;
  reference_image_path: string;
  key_category: "expression" | "pose" | "style";
  starts_at: string;
  status: "scheduled" | "judging" | "complete" | "invalid";
  result_ends_at: string | null;
  submitted_player_ids: string[];
  scores: RoundScore[];
};

export type FinalResult = {
  player_id: string;
  rank: number;
  round_wins: number;
  cumulative_total: number;
  second_place_finishes: number;
  worst_round_total: number | null;
  best_round_total: number | null;
};

export type RoomSnapshot = {
  id: string;
  code: string;
  status: RoomStatus;
  is_host: boolean;
  current_player_id: string;
  players: RoomPlayer[];
  round: RoundSnapshot | null;
  final_results: FinalResult[];
};
