export type PanelStatus = "ONLINE" | "OFFLINE" | "ERROR" | "DISABLED";

export interface PanelDTO {
  id: string;
  name: string;
  apiUrl: string;
  currency: string;
  notes: string | null;
  status: PanelStatus;
  enabled: boolean;
  balance: number;
  successRate: number;
  responseMs: number;
  priority: number;
  lastSyncedAt: string | null;
  createdAt: string;
  _count?: { services: number; orders: number };
}

export interface OrderDTO {
  id: string;
  batchId: string | null;
  postUrl: string;
  platform: string;
  boostType: string;
  quantity: number;
  startCount: number;
  remains: number;
  cost: number;
  status: string;
  providerOrderId: string | null;
  errorMessage: string | null;
  createdAt: string;
  panel?: { id: string; name: string };
}
