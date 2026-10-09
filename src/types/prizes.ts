export const PRIZE_CATALOG = [
  { id: 'ramen', name: '拉面', modelUrl: '/models/food/ramen.glb', icon: '🍜' },
  { id: 'burger', name: '汉堡', modelUrl: '/models/food/burger.glb', icon: '🍔' },
  { id: 'donut', name: '甜甜圈', modelUrl: '/models/food/donut.glb', icon: '🍩' },
  { id: 'sushi', name: '寿司', modelUrl: '/models/food/sushi.glb', icon: '🍣' },
  { id: 'cake', name: '蛋糕', modelUrl: '/models/food/cake.glb', icon: '🍰' },
  { id: 'pizza', name: '披萨', modelUrl: '/models/food/pizza.glb', icon: '🍕' },
] as const;

export type PrizeDefinition = typeof PRIZE_CATALOG[number];
export type PrizeId = PrizeDefinition['id'];

export interface CollectedPrize {
  /** UUID of the physical prize transferred out of the current scene. */
  id: string;
  prizeId: PrizeId;
  collectedAt: number;
}

export const PRIZE_STORAGE_KEY = 'chronoarc.prizes.v1';
