# `src/built-ins/modules/website-editor/src/components/ecommerceBridge.tsx`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (17)

- `interface CartItem (9 members)`
- `interface CartSnapshot (7 members)`
- `interface ProductVariant (6 members)`
- `interface Product (9 members)`
- `interface ResolvedVariant (7 members)`
- `interface VariantPickerState (3 members)`
- `interface ProductVariantPickerProps (3 members)`
- `setCartProvider(fn: () => CartSnapshot): void`
- `useCart(): CartSnapshot`
- `default ProductVariantPicker({ product, onChange, initialVariantId, }: ProductVariantPickerProps)`
- `interface StripeCheckoutInput (7 members)`
- `interface StripeCheckoutResult (3 members)`
- `async goToStripeCheckout(input: StripeCheckoutInput = {}): Promise<StripeCheckoutResult>`
- `interface OrderRecord (7 members)`
- `async fetchOrderBySessionId(sessionId: string): Promise<OrderRecord | null>`
- `async fetchProductVariants(productId: string): Promise<ProductVariant[]>`
- `async searchProducts(query: string, limit = 12): Promise<Product[]>`

## Used by (6)

- [`src/built-ins/modules/website-editor/src/components/blocks/CartSummaryBlock.tsx`](./blocks/CartSummaryBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/CheckoutSummaryBlock.tsx`](./blocks/CheckoutSummaryBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/OrderSuccessBlock.tsx`](./blocks/OrderSuccessBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/PaymentButtonBlock.tsx`](./blocks/PaymentButtonBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/VariantPickerBlock.tsx`](./blocks/VariantPickerBlock.md)
- [`src/built-ins/modules/website-editor/src/components/index.ts`](./index.md)

