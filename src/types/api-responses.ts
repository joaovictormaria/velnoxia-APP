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
} from "@prisma/client";

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
