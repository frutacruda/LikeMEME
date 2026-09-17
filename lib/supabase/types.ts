export type RoomStatus = "waiting" | "playing";

export type RoomPlayer = {
  id: string;
  nickname: string;
  seat: number;
  is_host: boolean;
};

export type RoomSnapshot = {
  id: string;
  code: string;
  status: RoomStatus;
  is_host: boolean;
  players: RoomPlayer[];
};
