import type { Response } from "express";

type RealtimeClient = {
  id: string;
  res: Response;
};

const clients = new Map<string, RealtimeClient>();

export function addRealtimeClient(
  id: string,
  res: Response,
) {
  clients.set(id, { id, res });

  res.write(
    `event: connected\ndata: ${JSON.stringify({
      connected: true,
    })}\n\n`,
  );
}

export function removeRealtimeClient(id: string) {
  clients.delete(id);
}

export function broadcastRealtime(
  event: string,
  data: unknown,
) {
  const message =
    `event: ${event}\n` +
    `data: ${JSON.stringify(data)}\n\n`;

  for (const [id, client] of clients) {
    try {
      client.res.write(message);
    } catch {
      clients.delete(id);
    }
  }
}

export function realtimeClientCount() {
  return clients.size;
}