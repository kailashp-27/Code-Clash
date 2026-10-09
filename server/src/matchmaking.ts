export interface QueuePlayer {
  userId: string;
  socketId: string;
  username: string;
  rating: number;
  joinedAt: number;
}

// Each player starts within 100 Elo and widens by 50 every 15 seconds, up to 400.
export function ratingWindow(joinedAt: number, now: number): number {
  return Math.min(400, 100 + Math.floor(Math.max(0, now - joinedAt) / 15000) * 50);
}

export class RankedQueue {
  private entries = new Map<string, QueuePlayer>();

  has(userId: string): boolean { return this.entries.has(userId); }
  add(player: QueuePlayer): boolean {
    if (this.has(player.userId)) return false;
    this.entries.set(player.userId, player);
    return true;
  }
  remove(userId: string, socketId: string): boolean {
    if (this.entries.get(userId)?.socketId !== socketId) return false;
    return this.entries.delete(userId);
  }
  takePair(now: number): [QueuePlayer, QueuePlayer] | null {
    const players = [...this.entries.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    for (const player of players) {
      const opponent = players.filter(other => other.userId !== player.userId
        && Math.abs(player.rating - other.rating) <= Math.min(ratingWindow(player.joinedAt, now), ratingWindow(other.joinedAt, now)))
        .sort((a, b) => Math.abs(a.rating - player.rating) - Math.abs(b.rating - player.rating) || a.joinedAt - b.joinedAt)[0];
      if (opponent) {
        this.entries.delete(player.userId);
        this.entries.delete(opponent.userId);
        return [player, opponent];
      }
    }
    return null;
  }
}
