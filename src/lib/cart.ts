// localStorage-backed cart. Browser-only — do not import from server code.
// Storing only product_id + timestamp on purpose. Prices and availability
// come fresh from the server at render time and at checkout.
export const CART_KEY = 'turquoise-cart-v1';
export const CART_CHANGED_EVENT = 'cart-changed';

export interface CartItem {
  product_id: string;
  added_at: string;
}

export interface Cart {
  items: CartItem[];
  updated_at: string;
}

function emptyCart(): Cart {
  return { items: [], updated_at: new Date().toISOString() };
}

function safeParse(raw: string | null): Cart {
  if (!raw) return emptyCart();
  try {
    const parsed = JSON.parse(raw) as Cart;
    if (!parsed || !Array.isArray(parsed.items)) return emptyCart();
    return parsed;
  } catch {
    return emptyCart();
  }
}

export function getCart(): Cart {
  if (typeof window === 'undefined') return emptyCart();
  try {
    return safeParse(window.localStorage.getItem(CART_KEY));
  } catch {
    return emptyCart();
  }
}

function write(cart: Cart): Cart {
  const next: Cart = { items: cart.items, updated_at: new Date().toISOString() };
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(next));
  } catch {
    // private browsing or quota — swallow; cart state still lives in memory for this pageview.
  }
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT, { detail: next }));
  return next;
}

export function addToCart(productId: string): Cart {
  const current = getCart();
  if (current.items.some((i) => i.product_id === productId)) {
    return current;
  }
  return write({
    items: [...current.items, { product_id: productId, added_at: new Date().toISOString() }],
    updated_at: current.updated_at,
  });
}

export function removeFromCart(productId: string): Cart {
  const current = getCart();
  return write({
    items: current.items.filter((i) => i.product_id !== productId),
    updated_at: current.updated_at,
  });
}

export function removeManyFromCart(productIds: string[]): Cart {
  const ids = new Set(productIds);
  const current = getCart();
  return write({
    items: current.items.filter((i) => !ids.has(i.product_id)),
    updated_at: current.updated_at,
  });
}

export function clearCart(): Cart {
  return write(emptyCart());
}

export function getCartCount(): number {
  return getCart().items.length;
}

export function isInCart(productId: string): boolean {
  return getCart().items.some((i) => i.product_id === productId);
}

export function subscribeToCart(fn: (cart: Cart) => void): () => void {
  const localHandler = (e: Event) => {
    const detail = (e as CustomEvent<Cart>).detail;
    fn(detail ?? getCart());
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key === CART_KEY) fn(getCart());
  };
  window.addEventListener(CART_CHANGED_EVENT, localHandler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(CART_CHANGED_EVENT, localHandler);
    window.removeEventListener('storage', storageHandler);
  };
}
