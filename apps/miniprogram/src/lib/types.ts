export interface User { id: string; username: string; role: 'OWNER' | 'SALESPERSON'; salespersonId: string | null; mustChangePassword: boolean }
export interface Session { user: User; csrf: string; accessToken: string }
export interface PageResult<T> { items: T[]; limit: number; offset: number; total: number; hasMore: boolean }
export interface Product { id: string; name: string; sku: string; min_price_cents: string; suggested_price_cents: string | null; active: number }
export interface Shift { id: string; status: string; event_id: string; booth_id: string; booth_location: string; event_name: string; first_name: string; last_name: string; planned_start: string; planned_end: string; business_date: string }
export interface Sale { id: string; sale_no: string | null; state: string; version: number; shift_id: string; event_id: string; total_cents: string; net_cents: string; tax_cents: string; booth_location?: string; created_at: string }
export interface SaleLine { line_no: number; product_id: string; quantity: number; final_unit_price_cents: string; line_net_cents: string; line_tax_cents: string; name_snapshot: string | null; current_name: string }
export interface SaleDetail { sale: Sale; lines: SaleLine[] }
export interface Balance { product_id: string; location_id: string; on_hand: string; reserved: string; version: number; location_name: string; product_name: string; sku: string }
export interface Location { id: string; code: string; name: string; kind: string; active: number; event_id: string | null; event_status: string | null; booth_active: number | null }
export interface ReturnRow { id: string; sale_id: string; state: string; destination_location_id: string; reason: string; total_cents: string; created_at: string }
export interface ReturnLine { line_no: number; sale_line_no: number; quantity: number; disposition: string; net_cents: string; tax_cents: string }
export interface Entry { id: string; salesperson_id: string; amount_cents: string; source_kind: string; source_id: string; created_at: string }
export interface Settlement { id: string; salesperson_id: string; state: string; total_cents: string; cutoff_at: string; payment_reference: string | null }
export interface Salesperson { id: string; first_name: string; last_name: string; active: number }
export interface IdResult { id: string; state?: string; totalCents?: string; changeCents?: string | null }
export interface DraftLine { productId: string; name: string; sku: string; quantity: string; finalUnitPrice: string; minPrice: string; subtotal: string }
export type InputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
export type TapEvent = WechatMiniprogram.BaseEvent;
