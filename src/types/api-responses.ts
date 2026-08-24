/**
 * TIPOS DE RESPOSTA DE SERVER FUNCTIONS
 *
 * Use estes tipos para tipificar retornos de server functions
 * ao invés de deixar `unknown` ou `{}`.
 *
 * Importar quando precisar:
 * import type { OrderResponse, ProductResponse } from '~/types/api-responses';
 */

import type {
  Order,
  OrderItem,
  OrderStatusHistory,
  Product,
  ProductSize,
  Extra,
  Category,
  Coupon,
  StoreSettings,
  Customer,
  Employee,
  EmployeeBenefitPlan,
  OrderStatus,
} from "@prisma/client";
type Decimal = any;

// ============ ORDERS ============

export type OrderResponse = Order & {
  items: OrderItem[];
  statusHistory: OrderStatusHistory[];
  customer?: Customer | null;
  coupon?: Coupon | null;
};

export type OrderDetailResponse = OrderResponse;

export type OrderListResponse = {
  orders: OrderResponse[];
  total: number;
  page: number;
  pageSize: number;
};

// ============ PRODUCTS ============

export type ProductResponse = Product & {
  sizes?: ProductSize[];
  category?: Category;
};

export type ProductListResponse = {
  products: ProductResponse[];
  total: number;
};

export type ProductsWithCategoriesResponse = {
  products: ProductResponse[];
  categories: CategoryResponse[];
};

export type ProductDetailResponse = {
  product: ProductResponse;
  categories: CategoryResponse[];
};

// ============ EXTRAS ============

export type ExtraResponse = Extra;

export type ExtraListResponse = {
  extras: ExtraResponse[];
};

// ============ CATEGORIES ============

export type CategoryResponse = Category & {
  products?: ProductResponse[];
};

export type CategoryListResponse = {
  categories: CategoryResponse[];
};

// ============ STORE SETTINGS ============

export type StoreSettingsResponse = StoreSettings;

// ============ CUSTOMERS ============

export type CustomerResponse = Customer;

export type CustomerListResponse = {
  customers: CustomerResponse[];
  total: number;
};

// ============ EMPLOYEES ============

export type EmployeeResponse = Employee & {
  benefitPlan?: EmployeeBenefitPlan | null;
};

export type EmployeeListResponse = {
  employees: EmployeeResponse[];
  total: number;
};

// ============ COUPONS ============

export type CouponResponse = Coupon;

export type CouponListResponse = {
  coupons: CouponResponse[];
  total: number;
};

// ============ KANBAN & MESA ============

export type KanbanMetrics = {
  totalOrders: number;
  avgPrepMinutes: number | null;
  avgDeliveryMinutes: number | null;
  completionRate: number | null;
};

export type KanbanResponse = {
  columns: any[];
  awaiting: any[];
  mostrarEntrega: boolean;
  metrics: KanbanMetrics;
};

export type MesaAbertas = {
  mesaId: string;
  numero: string;
  cliente?: string;
  pedidos: OrderResponse[];
}[];

export type MesasAbertasResponse = MesaAbertas;

// ============ ORDER TRACKING ============

export type TrackingResponse =
  | { ok: false }
  | {
      ok: true;
      order: {
        number: string | number;
        status: OrderStatus;
        type: string;
        total: Decimal;
        customerName: string;
        createdAt: Date;
        estimatedDeliveryAt: Date | null;
        storeSlug: string;
        items: Array<{
          productNameSnapshot: string;
          quantity: number;
          sizeLabel: string | null;
        }>;
        history: Array<{
          status: OrderStatus;
          createdAt: Date;
        }>;
        queuePosition: number | null;
        finished: boolean;
      };
    };

// ============ SUCCESS/ERROR RESPONSES ============

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiError = {
  ok: false;
  error: string;
  code: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
