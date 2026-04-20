export type ProductStatus = 'draft' | 'published' | 'sold' | 'archived';

export interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  display_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  piece_id: string;
  slug: string;
  title: string;
  description: string | null;
  price_cents: number;
  cost_cents: number | null;
  status: ProductStatus;
  featured: boolean;
  turquoise_type: string | null;
  metal: string | null;
  stone_origin: string | null;
  bead_size: string | null;
  length: string | null;
  weight_oz: number | null;
  meta_description: string | null;
  sold_at: string | null;
  reserved_until: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PRODUCT_IMAGES_BUCKET = 'product-images';
export const MAX_IMAGE_SLOTS = 5;
